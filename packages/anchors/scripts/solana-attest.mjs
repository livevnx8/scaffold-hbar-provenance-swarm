/**
 * solana-attest.mjs — Solana devnet attestation leg.
 *
 * Reads a claims file (proof-bundle shape), submits one Memo-program
 * transaction per claim on Solana devnet carrying the Hedera proof envelope
 * as the memo. Each tx is re-read independently and its memo byte-compared.
 *
 * Usage: node solana-attest.mjs --claims <claims.json> [--rpc <url>]
 * Default RPC: https://api.devnet.solana.com
 *
 * Funding: tries requestAirdrop first; if the airdrop hangs/fails, prints the
 * address and waits for a manual web-faucet (https://faucet.solana.com) top-up.
 * Keys live in memory only. Prints public data only.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  Connection, Keypair, Transaction, TransactionInstruction,
  PublicKey, LAMPORTS_PER_SOL,
} from '@solana/web3.js';

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) =>
    a.startsWith('--') ? [[a.slice(2), arr[i + 1]]] : []
  )
);
const claimsFile = args.claims;
const RPC = args.rpc || 'https://api.devnet.solana.com';
if (!claimsFile) {
  console.error('usage: node solana-attest.mjs --claims <claims.json> [--rpc <url>]');
  process.exit(2);
}
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const EXPLORER = (s) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;
const bundle = JSON.parse(readFileSync(claimsFile, 'utf8'));

const conn = new Connection(RPC, 'confirmed');

// ---- pre-flight: RPC alive and slot advancing ----
const slot0 = await Promise.race([
  conn.getSlot(),
  new Promise((_, rej) => setTimeout(() => rej(new Error('pre-flight: RPC unreachable (getSlot timed out)')), 20000)),
]);
await new Promise((r) => setTimeout(r, 4000));
const slot1 = await conn.getSlot();
if (slot1 <= slot0) throw new Error('pre-flight: slot not advancing');
console.log(`pre-flight OK: slot ${slot0} -> ${slot1} (${RPC})`);

// ---- fund one wallet ----
const wallet = Keypair.generate();
console.log(`wallet: ${wallet.publicKey.toBase58()}`);
async function funded() {
  const bal = await conn.getBalance(wallet.publicKey);
  return bal > 10000;
}
if (!(await funded())) {
  console.log('requesting airdrop (1 SOL)...');
  try {
    const sig = await Promise.race([
      conn.requestAirdrop(wallet.publicKey, LAMPORTS_PER_SOL),
      new Promise((_, rej) => setTimeout(() => rej(new Error('airdrop timed out after 120s'))), 120000),
    ]);
    await conn.confirmTransaction(sig, 'confirmed');
    console.log(`airdrop confirmed: ${sig}`);
  } catch (e) {
    console.log(`airdrop failed: ${e.message}`);
    console.log(`FUND MANUALLY: send devnet SOL to ${wallet.publicKey.toBase58()} via https://faucet.solana.com`);
    console.log('waiting for funds (polling every 10s, Ctrl-C to abort)...');
    for (;;) {
      await new Promise((r) => setTimeout(r, 10000));
      if (await funded()) break;
    }
  }
}
console.log(`balance: ${await conn.getBalance(wallet.publicKey)} lamports`);

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
  const ix = new TransactionInstruction({
    keys: [], programId: MEMO_PROGRAM_ID, data: Buffer.from(memoJson, 'utf8'),
  });
  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.sign(wallet);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  console.log(`${p.claimId}: sent ${sig}, confirming...`);
  const conf = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  if (conf.value.err) throw new Error(`${p.claimId}: tx failed on-chain: ${JSON.stringify(conf.value.err)}`);
  // independent verification: re-read parsed, extract memo, byte-compare
  const parsed = await conn.getParsedTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  const memoIx = parsed?.transaction?.message?.instructions?.find(
    (i) => i.programId?.toBase58?.() === MEMO_PROGRAM_ID.toBase58()
  );
  const onchainMemo = memoIx?.parsed ?? null;
  const memoMatch = onchainMemo === memoJson;
  console.log(`${p.claimId}: sig=${sig} slot=${parsed?.slot} memoMatch=${memoMatch}`);
  if (!memoMatch) throw new Error(`${p.claimId}: memo verification failed`);
  results.push({
    claimId: p.claimId, verdict: p.verdict, signature: sig,
    slot: parsed.slot, memoByteMatch: memoMatch, explorer: EXPLORER(sig),
  });
}

const evidence = {
  run: 'solana-attest', network: 'solana-devnet', ranAt: new Date().toISOString(),
  rpc: RPC, wallet: wallet.publicKey.toBase58(), hederaTopic: bundle.topic,
  attestations: results,
  reconciliation: `${results.length}/${bundle.proofs.length} confirmed with memo byte-match`,
};
const fname = `solana-evidence-${Date.now()}.json`;
writeFileSync(fname, JSON.stringify(evidence, null, 2));
console.log(`\nreconciliation: ${evidence.reconciliation}\nevidence written: ${fname}`);
