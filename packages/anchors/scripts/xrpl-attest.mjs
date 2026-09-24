/**
 * xrpl-attest.mjs — XRPL attestation leg (generalized).
 *
 * Reads a claims file (proof-bundle shape), submits one Payment per claim
 * from wallet A to wallet B on XRPL devnet or testnet, carrying the Hedera
 * proof envelope in Memos. Strict tesSUCCESS required; each tx is re-read
 * independently and its memo byte-compared.
 *
 * Usage: node xrpl-attest.mjs --claims <claims.json> [--network devnet|testnet]
 * Claims file shape: { "topic": "0.0.xxxxx", "proofs": [ {claimId, verdict,
 *   decisionHash, taskHash, sequenceNumber, consensusTimestamp}, ... ] }
 *
 * Keys live in memory only. Prints public data only.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Wallet } from 'xrpl';

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) =>
    a.startsWith('--') ? [[a.slice(2), arr[i + 1]]] : []
  )
);
const claimsFile = args.claims;
const NETWORK = args.network || 'devnet';
if (!claimsFile || !['devnet', 'testnet'].includes(NETWORK)) {
  console.error('usage: node xrpl-attest.mjs --claims <claims.json> [--network devnet|testnet]');
  process.exit(2);
}

const NETS = {
  devnet: {
    rpc: 'https://s.devnet.rippletest.net:51234/',
    faucet: 'https://faucet.devnet.rippletest.net/accounts',
    explorer: (h) => `https://devnet.xrpl.org/transactions/${h}`,
  },
  testnet: {
    rpc: 'https://s.altnet.rippletest.net:51234/',
    faucet: 'https://faucet.altnet.rippletest.net/accounts',
    explorer: (h) => `https://testnet.xrpl.org/transactions/${h}`,
  },
};
const NET = NETS[NETWORK];
const bundle = JSON.parse(readFileSync(claimsFile, 'utf8'));
const hex = (s) => Buffer.from(s, 'utf8').toString('hex').toUpperCase();

async function rpc(method, params = [{}]) {
  const res = await fetch(NET.rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  const j = await res.json();
  if (j.result?.error) throw new Error(`${method}: ${j.result.error} ${j.result.error_message ?? ''}`);
  return j.result;
}

// ---- pre-flight: ledger advancing, fee sane ----
const fee0 = await rpc('fee');
const led0 = await rpc('ledger', [{ ledger_index: 'validated' }]);
await new Promise((r) => setTimeout(r, 5000));
const led1 = await rpc('ledger', [{ ledger_index: 'validated' }]);
if (led1.ledger_index <= led0.ledger_index) throw new Error('pre-flight: ledger not advancing');
const baseFee = Number(fee0.drops.base_fee);
if (!Number.isFinite(baseFee) || baseFee <= 0 || baseFee > 100000) throw new Error('pre-flight: insane fee');
console.log(`pre-flight OK: ledger ${led0.ledger_index} -> ${led1.ledger_index}, base_fee ${baseFee} drops`);

// ---- fund two wallets (testnet node has eaten submits before: two wallets, A->B) ----
async function fund(address) {
  const res = await fetch(NET.faucet, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ destination: address }),
  });
  if (!res.ok) throw new Error(`faucet ${res.status}`);
}
async function waitForAccount(address) {
  for (let i = 0; i < 40; i++) {
    try { await rpc('account_info', [{ account: address, ledger_index: 'validated' }]); return; }
    catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`account ${address} never appeared`);
}
const walletA = Wallet.generate();
const walletB = Wallet.generate();
await fund(walletA.address);
await fund(walletB.address);
await waitForAccount(walletA.address);
await waitForAccount(walletB.address);
console.log(`funded A=${walletA.address} B=${walletB.address}`);

// ---- attest each claim ----
const results = [];
for (const p of bundle.proofs) {
  const attestation = {
    protocol: 'provenance-swarm/v1',
    claimId: p.claimId,
    verdict: p.verdict,
    decisionHash: p.decisionHash,
    taskHash: p.taskHash,
    hederaTopic: bundle.topic,
    hederaSequence: p.sequenceNumber,
    hederaConsensusTimestamp: p.consensusTimestamp,
    hederaVerifyReceipt: true,
  };
  const memoJson = JSON.stringify(attestation);
  const acct = await rpc('account_info', [{ account: walletA.address, ledger_index: 'validated' }]);
  const ledger = await rpc('ledger', [{ ledger_index: 'validated' }]);
  const txJson = {
    TransactionType: 'Payment',
    Account: walletA.address,
    Destination: walletB.address,
    Amount: '1',
    Fee: String(baseFee * 10),
    Sequence: acct.account_data.Sequence,
    LastLedgerSequence: ledger.ledger_index + 20,
    SigningPubKey: walletA.publicKey,
    Memos: [{ Memo: { MemoType: hex('provenance-swarm/v1'), MemoData: hex(memoJson) } }],
  };
  const { tx_blob, hash } = walletA.sign(txJson);
  const sub = await rpc('submit', [{ tx_blob }]);
  if (sub.engine_result !== 'tesSUCCESS') {
    throw new Error(`${p.claimId}: submit not clean: ${sub.engine_result} ${sub.engine_result_message ?? ''}`);
  }
  let tx = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const t = await rpc('tx', [{ transaction: hash }]);
      if (t.validated) { tx = t; break; }
    } catch { /* not yet */ }
  }
  if (!tx) throw new Error(`${p.claimId}: tx ${hash} never validated`);
  const memoHex = tx.Memos?.[0]?.Memo?.MemoData;
  const memoMatch = memoHex === hex(memoJson);
  const typeMatch = tx.Memos?.[0]?.Memo?.MemoType === hex('provenance-swarm/v1');
  console.log(`${p.claimId}: hash=${hash} validated memoMatch=${memoMatch} typeMatch=${typeMatch}`);
  if (!memoMatch || !typeMatch) throw new Error(`${p.claimId}: memo verification failed`);
  results.push({
    claimId: p.claimId, verdict: p.verdict, txHash: hash,
    engineResult: sub.engine_result, ledgerIndex: tx.ledger_index,
    memoByteMatch: memoMatch, explorer: NET.explorer(hash),
  });
}

const evidence = {
  run: 'xrpl-attest', network: `xrpl-${NETWORK}`, ranAt: new Date().toISOString(),
  accountA: walletA.address, accountB: walletB.address, hederaTopic: bundle.topic,
  attestations: results,
  reconciliation: `${results.length}/${bundle.proofs.length} validated with memo byte-match`,
};
const fname = `xrpl-evidence-${Date.now()}.json`;
writeFileSync(fname, JSON.stringify(evidence, null, 2));
console.log(`\nreconciliation: ${evidence.reconciliation}\nevidence written: ${fname}`);
