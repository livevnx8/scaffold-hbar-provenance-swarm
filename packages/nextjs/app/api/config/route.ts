import { NextResponse } from 'next/server';

export async function GET() {
  const hedera = Boolean(process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_KEY);
  const topic = Boolean(
    process.env.HEDERA_TEMPLATE_TOPIC_ID?.trim() || process.env.HEDERA_PROVENANCE_TOPIC_ID?.trim(),
  );
  return NextResponse.json({
    hedera,
    topic,
    certificateToken: Boolean(process.env.HEDERA_CERTIFICATE_TOKEN_ID?.trim()),
    registry: Boolean(process.env.HEDERA_REGISTRY_ADDRESS?.trim()),
    network: process.env.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet',
    // Phase 2: the oracle path is configured (pinned testnet feeds, read-only
    // via Hashio). Live availability is proven per-request at attestation.
    oracle: true,
  });
}
