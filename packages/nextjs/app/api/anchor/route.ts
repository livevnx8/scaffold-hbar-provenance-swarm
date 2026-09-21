import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import {
  HederaAnchor,
  mirrorMessageUrl,
  parseOperatorKey,
} from '@provenance-swarm/swarm';
import { gateReceipt } from '@/lib/anchorGate';
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

  // HederaAnchor.fromEnv already honors both HEDERA_TEMPLATE_TOPIC_ID and the
  // legacy HEDERA_PROVENANCE_TOPIC_ID (see configFromEnv), so no env aliasing
  // is needed here. Never mutate process.env to do it.
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
      // Normalize through the same curve-aware parser the HCS path uses, so
      // DER-encoded, 0x-prefixed, and raw hex operator keys all work here.
      const keyType =
        process.env.HEDERA_KEY_TYPE === 'ecdsa'
          ? 'ecdsa'
          : process.env.HEDERA_KEY_TYPE === 'ed25519'
            ? 'ed25519'
            : undefined;
      let walletKey: string;
      try {
        walletKey =
          '0x' + parseOperatorKey(process.env.HEDERA_OPERATOR_KEY!, keyType).toStringRaw().replace(/^0x/, '');
      } catch {
        throw new Error(
          'HEDERA_OPERATOR_KEY is not a usable private key for the registry path. ' +
            'Set HEDERA_KEY_TYPE=ecdsa|ed25519 to match the key curve.',
        );
      }
      const wallet = new ethers.Wallet(walletKey, provider);
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