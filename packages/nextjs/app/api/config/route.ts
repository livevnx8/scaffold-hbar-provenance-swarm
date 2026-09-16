import { NextResponse } from 'next/server';

export async function GET() {
  const hedera = Boolean(process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_KEY);
  return NextResponse.json({
    hedera,
    topic: Boolean(process.env.HEDERA_PROVENANCE_TOPIC_ID),
    certificateToken: Boolean(process.env.HEDERA_CERTIFICATE_TOKEN_ID),
    registry: Boolean(process.env.HEDERA_REGISTRY_ADDRESS),
    network: process.env.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet',
  });
}