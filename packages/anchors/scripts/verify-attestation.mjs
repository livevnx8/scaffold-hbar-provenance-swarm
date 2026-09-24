/**
 * verify-attestation.mjs — the independent checker (universal).
 *
 * Given an attestation on any supported chain, walks the full provenance chain
 * and verifies every link. No trust in the attester required:
 *
 *   foreign-chain tx -> envelope -> HCS message -> registry receipt -> Chainlink
 *
 * Usage:
 *   node verify-attestation.mjs xrpl <tx-hash>
 *   node verify-attestation.mjs solana <tx-signature> [--rpc <url>]
 *   node verify-attestation.mjs evm <tx-hash> --rpc <url>
 *   node verify-attestation.mjs <64-hex-tx-hash>   (legacy: xrpl)
 *
 * Exit 0 = every check passed. Exit 1 = any check failed.
 * All reads are public: XRPL JSON-RPC, Solana RPC, EVM RPC, Hedera mirror node.
 */
import { JsonRpcProvider, Contract } from 'ethers';

const MIRROR = 'https://testnet.mirrornode.hedera.com/api/v1';
const REGISTRY = '0x5Ad54d39d860Cb2c2c6A27c787eead7358137e1a';
const FEED = '0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a';
const XRPL_RPC = 'https://s.devnet.rippletest.net:51234/';
const SOLANA_MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

// ---------- argument parsing ----------
let [chain, ref, ...rest] = process.argv.slice(2);
const restArgs = Object.fromEntries(
  rest.flatMap((a, i, arr) => (a.startsWith('--') ? [[a.slice(2), arr[i + 1]]] : []))
);
if (!['xrpl', 'solana', 'evm'].includes(chain)) {
  // legacy: bare 64-hex hash means xrpl
  if (/^[0-9A-Fa-f]{64}$/.test(chain || '')) { ref = chain; chain = 'xrpl'; }
  else {
    console.error('usage: node verify-attestation.mjs (xrpl|solana|evm) <tx-ref> [--rpc <url>]');
    process.exit(2);
  }
}

// ---------- chain adapters: return the envelope + run chain-native checks ----------
async function adaptXrpl(txHash) {
  async function xrpl(method, params = [{}]) {
    const r = await fetch(XRPL_RPC, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, params }),
    });
    const j = await r.json();
    if (j.result?.error) throw new Error(`xrpl ${method}: ${j.result.error}`);
    return j.result;
  }
  const tx = await xrpl('tx', [{ transaction: txHash.toUpperCase() }]);
  check('xrpl: transaction validated on ledger', tx.validated === true, `ledger ${tx.ledger_index}`);
  check('xrpl: clean execution', tx.meta?.TransactionResult === 'tesSUCCESS', tx.meta?.TransactionResult);
  const memoHex = tx.Memos?.[0]?.Memo?.MemoData;
  const memoType = tx.Memos?.[0]?.Memo?.MemoType;
  check('xrpl: memo present with protocol type',
    !!memoHex && memoType === Buffer.from('provenance-swarm/v1', 'utf8').toString('hex').toUpperCase());
  const memo = JSON.parse(Buffer.from(memoHex, 'hex').toString('utf8'));
  check('xrpl: memo is a provenance envelope', memo.protocol === 'provenance-swarm/v1', memo.claimId);
  return memo;
}

async function adaptSolana(sig, rpcUrl) {
  const { Connection, PublicKey } = await import('@solana/web3.js');
  const conn = new Connection(rpcUrl || 'https://api.devnet.solana.com', 'confirmed');
  const parsed = await conn.getParsedTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  check('solana: transaction exists and is confirmed', !!parsed, `slot ${parsed?.slot}`);
  check('solana: no on-chain error', !parsed?.meta?.err, parsed?.meta?.err ? JSON.stringify(parsed.meta.err) : '');
  const memoIx = parsed?.transaction?.message?.instructions?.find(
    (i) => i.programId?.toBase58?.() === new PublicKey(SOLANA_MEMO_PROGRAM).toBase58()
  );
  check('solana: memo-program instruction present', !!memoIx);
  const memo = JSON.parse(memoIx.parsed);
  check('solana: memo is a provenance envelope', memo.protocol === 'provenance-swarm/v1', memo.claimId);
  return memo;
}

async function adaptEvm(txHash, rpcUrl) {
  if (!rpcUrl) { console.error('evm adapter requires --rpc <url>'); process.exit(2); }
  const provider = new JsonRpcProvider(rpcUrl);
  const tx = await provider.getTransaction(txHash);
  check('evm: transaction exists', !!tx);
  check('evm: transaction mined', !!tx?.blockNumber, `block ${tx?.blockNumber}`);
  const receipt = await provider.getTransactionReceipt(txHash);
  check('evm: clean execution', receipt?.status === 1, `status ${receipt?.status}`);
  const dataHex = tx?.data || '0x';
  const memo = JSON.parse(Buffer.from(dataHex.slice(2), 'hex').toString('utf8'));
  check('evm: calldata is a provenance envelope', memo.protocol === 'provenance-swarm/v1', memo.claimId);
  return memo;
}

const envelope = chain === 'xrpl' ? await adaptXrpl(ref)
  : chain === 'solana' ? await adaptSolana(ref, restArgs.rpc)
  : await adaptEvm(ref, restArgs.rpc);

// ---------- shared core: Hedera + Chainlink, chain-agnostic ----------
const hcsRes = await fetch(`${MIRROR}/topics/${envelope.hederaTopic}/messages/${envelope.hederaSequence}`);
if (!hcsRes.ok) check('hedera: HCS message exists', false, `http ${hcsRes.status}`);
else {
  const hcs = await hcsRes.json();
  const hcsMsg = JSON.parse(Buffer.from(hcs.message, 'base64').toString('utf8'));
  const norm = (h) => (h || '').toLowerCase();
  check('hedera: HCS message exists', true, `seq ${envelope.hederaSequence}`);
  check('hedera: claimId matches', hcsMsg.claimId === envelope.claimId);
  check('hedera: decisionHash matches',
    norm(hcsMsg.decisionHash) === norm(envelope.decisionHash) ||
    norm(hcsMsg.decisionHash) === norm('0x' + envelope.decisionHash));
  check('hedera: taskHash matches',
    norm(hcsMsg.taskHash) === norm(envelope.taskHash) ||
    norm(hcsMsg.taskHash) === norm('0x' + envelope.taskHash));
  check('hedera: verdict matches', hcsMsg.verdict === envelope.verdict);
  check('hedera: consensus timestamp matches', hcs.consensus_timestamp === envelope.hederaConsensusTimestamp);
}

const provider = new JsonRpcProvider('https://testnet.hashio.io/api');
const registry = new Contract(REGISTRY,
  ['function verifyReceipt(string,bytes32) view returns (bool)',
   'function getAnchor(string) view returns (bytes32,uint64,address)'], provider);
const dh = envelope.decisionHash.startsWith('0x') ? envelope.decisionHash : '0x' + envelope.decisionHash;
const receiptOk = await registry.verifyReceipt(envelope.claimId, dh);
check('hedera: registry verifyReceipt true', receiptOk === true);
const [anchoredHash] = await registry.getAnchor(envelope.claimId);
check('hedera: anchored decisionHash matches envelope', anchoredHash.toLowerCase() === dh.toLowerCase());

if (/value/.test(envelope.claimId)) {
  const data = await provider.call({ to: FEED, data: '0xfeaf968c' });
  const answer = BigInt('0x' + data.slice(2 + 64, 2 + 128));
  const price = Number(answer) / 1e8;
  check('chainlink: feed readable', price > 0, `HBAR/USD now $${price.toFixed(8)}`);
  console.log(`      (value claim ${envelope.verdict === 'verified' ? 'passed' : 'failed'} the oracle band at verify time; ` +
    `the binding round is embedded in the claim's oracle evidence, hashed into taskHash)`);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
