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
import {
  VnxProvenanceClient,
  veraGenesisClaim,
  HederaAnchor,
} from '../src/index.js';

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

  // 4 — create the collection (reuse HEDERA_CERTIFICATE_TOKEN_ID when set)
  const tokenId =
    process.env.HEDERA_CERTIFICATE_TOKEN_ID ||
    (await anchor.createCertificateToken('Vera Genesis Receipt', 'VGEN'));
  if (process.env.HEDERA_CERTIFICATE_TOKEN_ID) {
    console.log(`reusing collection: ${tokenId}`);
  } else {
    console.log(`collection created: ${tokenId}`);
  }
  console.log(`  ${hashscanToken(network, tokenId)}`);

  // 5 — mint. HTS caps NFT metadata at 100 bytes, so the full HIP-412 JSON
  // (vera-nft/metadata.json, kept in the repo for IPFS pinning) cannot go
  // on-chain directly. The token carries a compact, self-verifying pointer:
  //   <claimId>/<decisionHash>
  // Anyone can take the decision hash to the HCS topic and replay the receipt.
  const compact = `${receipt.claimId}/${receipt.decisionHash}`;
  if (Buffer.byteLength(compact, 'utf8') > 100) {
    throw new Error('Compact receipt pointer exceeds the 100-byte HTS metadata limit');
  }
  console.log(`compact on-chain metadata (${compact.length} bytes): ${compact}`);
  const mint = await anchor.mintCertificate(receipt, {
    metadata: Buffer.from(compact, 'utf8'),
  });
  console.log(`minted serial #${mint.serial} on ${mint.tokenId}`);
  console.log(`  ${hashscanTx(network, mint.transactionId)}`);

  anchor.close();
}

main().catch((err) => {
  console.error('mint failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
