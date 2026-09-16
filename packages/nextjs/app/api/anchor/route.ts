import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { HederaAnchor } from '@provenance-swarm/swarm';
import type { ProvenanceReceipt } from '@provenance-swarm/swarm';

const REGISTRY_ABI = [
  'function anchorReceipt(string calldata claimId, bytes32 decisionHash) external',
];

function toBytes32(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error('decisionHash must be 64 hex characters');
  }
  return '0x' + clean.toLowerCase();
}

export async function POST(req: Request) {
  let receipt: ProvenanceReceipt;
  try {
    ({ receipt } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!receipt?.claimId || !receipt?.decisionHash) {
    return NextResponse.json({ error: 'Body must include a receipt' }, { status: 400 });
  }

  const anchor = HederaAnchor.fromEnv();
  if (!anchor) {
    return NextResponse.json(
      {
        error:
          'Hedera operator not configured. Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in packages/nextjs/.env (testnet).',
      },
      { status: 400 },
    );
  }

  const out: Record<string, unknown> = {};

  // 1 — HCS anchor
  try {
    out.hcs = { ok: true, ...(await anchor.anchorReceipt(receipt)) };
  } catch (err) {
    out.hcs = { ok: false, error: err instanceof Error ? err.message : 'HCS anchor failed' };
  }

  // 2 — registry contract
  const registryAddress = process.env.HEDERA_REGISTRY_ADDRESS;
  if (!registryAddress) {
    out.contract = { ok: false, skipped: 'no-registry' };
  } else {
    try {
      const rpcUrl = process.env.HEDERA_RPC_URL || 'https://testnet.hashio.io/api';
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(process.env.HEDERA_OPERATOR_KEY!, provider);
      const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, wallet);
      const tx = await registry.anchorReceipt(receipt.claimId, toBytes32(receipt.decisionHash));
      const mined = await tx.wait();
      out.contract = {
        ok: true,
        address: registryAddress,
        transactionId: mined?.hash ?? tx.hash,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Contract anchor failed';
      out.contract = {
        ok: false,
        error: msg.includes('already anchored') ? 'This claim is already anchored on-chain' : msg,
      };
    }
  }

  // 3 — certificate NFT (verified claims only)
  if (receipt.verdict !== 'verified') {
    out.nft = { ok: false, skipped: 'verdict-not-verified' };
  } else {
    try {
      out.nft = { ok: true, ...(await anchor.mintCertificate(receipt)) };
    } catch (err) {
      out.nft = { ok: false, error: err instanceof Error ? err.message : 'Mint failed' };
    }
  }

  try {
    anchor.close();
  } catch {
    /* ignore */
  }

  return NextResponse.json(out);
}