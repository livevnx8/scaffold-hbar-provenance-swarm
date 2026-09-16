/**
 * LIVE mint of the Vera Genesis Receipt NFT on Hedera.
 *
 * Requires testnet credentials in env:
 *   HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY (HEDERA_NETWORK=testnet default)
 *
 * Usage: npx tsx scripts/mint-vera-genesis.ts
 *
 * Flow: build the genesis claim → verify it (must be verified) → anchor the
 * receipt on HCS → create the "Vera Genesis Receipt" (VGEN) collection →
 * mint serial #1 with the HIP-412 metadata JSON as its on-chain metadata.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  VnxProvenanceClient,
  veraGenesisClaim,
  HederaAnchor,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));

function hashscanTx(network: string, txId: string): string {
  const net = network === 'mainnet' ? 'mainnet' : 'testnet';
  return `https://hashscan.io/${net}/transaction/${txId}`;
}
function hashscanToken(network: string, tokenId: string): string {
  const net = network === 'mainnet' ? 'mainnet' : 'testnet';
  return `https://hashscan.io/${net}/token/${tokenId}`;
}

async function main(): Promise<void> {
  const network = process.env.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
  if (network === 'mainnet') {
    throw new Error('Refusing to mint the genesis NFT on mainnet — testnet only.');
  }

  // 1 — verify the genesis claim (offline, deterministic)
  const client = new VnxProvenanceClient();
  const claim = veraGenesisClaim();
  const { receipt, report } = client.verifyClaim(claim);
  if (receipt.verdict !== 'verified' || report.verdict !== 'accepted') {
    throw new Error(`Genesis claim did not verify: ${receipt.verdict}/${report.verdict}`);
  }
  console.log(`verified: ${receipt.claimId} decision=${receipt.decisionHash.slice(0, 16)}…`);

  // 2 — Hedera client from env
  const anchor = HederaAnchor.fromEnv();
  if (!anchor) {
    throw new Error('Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in env (testnet).');
  }

  // 3 — HCS anchor
  const hcs = await anchor.anchorReceipt(receipt);
  console.log(`HCS anchored: topic ${hcs.topicId} seq ${hcs.sequenceNumber}`);
  console.log(`  ${hashscanTx(network, hcs.transactionId)}`);

  // 4 — create the collection
  const tokenId = await anchor.createCertificateToken('Vera Genesis Receipt', 'VGEN');
  console.log(`collection created: ${tokenId}`);
  console.log(`  ${hashscanToken(network, tokenId)}`);

  // 5 — mint with HIP-412 metadata
  const metadata = readFileSync(join(here, '..', '..', '..', 'vera-nft', 'metadata.json'));
  const mint = await anchor.mintCertificate(receipt, { metadata });
  console.log(`minted serial #${mint.serial} on ${mint.tokenId}`);
  console.log(`  ${hashscanTx(network, mint.transactionId)}`);

  anchor.close();
}

main().catch((err) => {
  console.error('mint failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
