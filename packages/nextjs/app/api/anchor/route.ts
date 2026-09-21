import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import {
  HederaAnchor,
  mirrorMessageUrl,
  verifyProvenanceReceipt,
  ProvenanceClient,
} from '@provenance-swarm/swarm';
import type {
  ProvenanceReceipt,
  ProvenanceClaim,
  HederaNetworkName,
} from '@provenance-swarm/swarm';

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


/** Frozen Window 9 exhibit topic — never write from template live-anchor paths. */
const FROZEN_EXHIBIT_TOPIC_ID = '0.0.10569989';

/**
 * Server-side gate: refuse forged "verified" receipts before any HCS /
 * registry / NFT write. Requires the original claim so we can re-verify.
 */
function gateReceipt(
  receipt: ProvenanceReceipt,
  claim: ProvenanceClaim | undefined,
): { ok: true } | { ok: false; error: string; status: number; checks?: unknown } {
  if (!claim || typeof claim.claimId !== 'string' || !claim.claimId) {
    return {
      ok: false,
      status: 400,
      error:
        'Body must include the original claim alongside the receipt. Anchoring without a claim cannot re-verify provenance.',
    };
  }
  if (claim.claimId !== receipt.claimId) {
    return {
      ok: false,
      status: 400,
      error: `claim.claimId (${claim.claimId}) does not match receipt.claimId (${receipt.claimId})`,
    };
  }

  const verification = verifyProvenanceReceipt(receipt, claim);
  if (!verification.ok) {
    return {
      ok: false,
      status: 403,
      error:
        'Receipt failed server-side provenance verification. Forged or inconsistent receipts are not anchored.',
      checks: verification.checks,
    };
  }

  // Defence in depth: re-run the swarm and require an exact match so a
  // self-consistent but fabricated receipt/claim pair cannot sail through.
  const { receipt: recomputed } = new ProvenanceClient().verifyClaim(claim);
  if (
    recomputed.taskHash !== receipt.taskHash ||
    recomputed.decisionHash !== receipt.decisionHash ||
    recomputed.verdict !== receipt.verdict
  ) {
    return {
      ok: false,
      status: 403,
      error:
        'Receipt does not match a fresh verifyClaim for the posted claim. Refusing to anchor.',
    };
  }

  return { ok: true };
}

function liveTopicId(): string | undefined {
  // Prefer HEDERA_TEMPLATE_TOPIC_ID (live template anchors). Fall back to the
  // older HEDERA_PROVENANCE_TOPIC_ID name for compatibility.
  return (
    process.env.HEDERA_TEMPLATE_TOPIC_ID?.trim() ||
    process.env.HEDERA_PROVENANCE_TOPIC_ID?.trim() ||
    undefined
  );
}

export async function POST(req: Request) {
  let body: { receipt?: ProvenanceReceipt; claim?: ProvenanceClaim };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { receipt, claim } = body;
  if (!receipt?.claimId || !receipt?.decisionHash) {
    return NextResponse.json({ error: 'Body must include a receipt' }, { status: 400 });
  }

  const gate = gateReceipt(receipt, claim);
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error, checks: 'checks' in gate ? gate.checks : undefined },
      { status: gate.status },
    );
  }

  const configuredTopic = liveTopicId();
  if (configuredTopic === FROZEN_EXHIBIT_TOPIC_ID) {
    return NextResponse.json(
      {
        error:
          `Live topic is set to the frozen Window 9 exhibit topic (${FROZEN_EXHIBIT_TOPIC_ID}). ` +
          'Template live anchors must use a separate topic via HEDERA_TEMPLATE_TOPIC_ID ' +
          '(or HEDERA_PROVENANCE_TOPIC_ID). Leave it empty to auto-create one. ' +
          'Read-only exhibit id: HEDERA_EXHIBIT_TOPIC_ID (see docs/window-9/identifiers.md).',
      },
      { status: 400 },
    );
  }

  // Point HederaAnchor.fromEnv at the template topic under the legacy name it
  // already reads, without ever pointing it at the exhibit topic.
  if (process.env.HEDERA_TEMPLATE_TOPIC_ID?.trim() && !process.env.HEDERA_PROVENANCE_TOPIC_ID?.trim()) {
    process.env.HEDERA_PROVENANCE_TOPIC_ID = process.env.HEDERA_TEMPLATE_TOPIC_ID.trim();
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
  const network: HederaNetworkName =
    process.env.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

  // 1 — HCS anchor
  try {
    const anchored = await anchor.anchorReceipt(receipt);
    if (anchored.topicId === FROZEN_EXHIBIT_TOPIC_ID) {
      out.hcs = {
        ok: false,
        error: `Refusing to treat exhibit topic ${FROZEN_EXHIBIT_TOPIC_ID} as a live template anchor.`,
      };
    } else {
      out.hcs = {
        ok: true,
        ...anchored,
        mirrorUrl: mirrorMessageUrl(network, anchored.topicId, anchored.sequenceNumber),
        network,
      };
    }
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