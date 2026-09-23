import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import {
  HederaAnchor,
  mirrorMessageUrl,
  parseOperatorKey,
  FROZEN_EXHIBIT_TOPIC_ID,
} from '@provenance-swarm/swarm';
import { gateReceipt } from '@/lib/anchorGate';
import { registryGuard } from '@/lib/registryGuard';
import { mintSkipReason } from '@/lib/mintGate';
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

/** Strip raw RPC / SDK noise before returning an error to the client. */
function sanitizeError(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  // Known user-facing messages pass through.
  if (
    trimmed.includes('already anchored') ||
    trimmed.includes('HEDERA_OPERATOR_KEY is not a usable') ||
    trimmed.includes('No certificate token configured') ||
    trimmed.includes('Refusing to') ||
    trimmed.includes('Live topic is set')
  ) {
    if (trimmed.includes('already anchored')) {
      return 'This claim is already anchored on-chain';
    }
    return trimmed.length > 240 ? trimmed.slice(0, 240) + '…' : trimmed;
  }
  // Drop hex dumps / stack-ish fragments.
  const cleaned = trimmed
    .replace(/0x[a-fA-F0-9]{20,}/g, '[hex]')
    .replace(/\n[\s\S]*/g, '')
    .slice(0, 180);
  return cleaned || fallback;
}

function liveTopicId(): string | undefined {
  return (
    process.env.HEDERA_TEMPLATE_TOPIC_ID?.trim() ||
    process.env.HEDERA_PROVENANCE_TOPIC_ID?.trim() ||
    undefined
  );
}

type StageResult = { ok: boolean; skipped?: string; error?: string; [k: string]: unknown };

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

  // Malformed-but-present operator keys must not 500.
  let anchor: HederaAnchor;
  try {
    const maybe = HederaAnchor.fromEnv();
    if (!maybe) {
      // Server misconfig → 500
      return NextResponse.json(
        {
          error:
            'Hedera operator not configured. Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in packages/nextjs/.env (testnet).',
        },
        { status: 500 },
      );
    }
    anchor = maybe;
  } catch (err) {
    return NextResponse.json(
      {
        error: sanitizeError(
          err instanceof Error ? err.message : '',
          'Hedera operator key could not be loaded. Check HEDERA_OPERATOR_KEY / HEDERA_KEY_TYPE.',
        ),
      },
      { status: 400 },
    );
  }

  const out: { hcs: StageResult; contract: StageResult; nft: StageResult } = {
    hcs: { ok: false },
    contract: { ok: false },
    nft: { ok: false },
  };
  const network: HederaNetworkName =
    process.env.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

  // One-anchor-per-claim is enforced by the registry contract, and only by it.
  // Without it the same claim could anchor twice and mint twice (F6), so the
  // route fails closed here, before any HCS or NFT write.
  const guard = registryGuard();
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error, ...out }, { status: 400 });
  }
  const registryAddress = guard.address;

  // 1 — HCS anchor
  try {
    const anchored = await anchor.anchorReceipt(receipt);
    // FROZEN_EXHIBIT_TOPIC_ID is already refused in ensureTopic; no dead post-check.
    out.hcs = {
      ok: true,
      ...anchored,
      mirrorUrl: mirrorMessageUrl(network, anchored.topicId, anchored.sequenceNumber),
      network,
    };
  } catch (err) {
    out.hcs = {
      ok: false,
      error: sanitizeError(err instanceof Error ? err.message : '', 'HCS anchor failed'),
    };
  }

  // 2 — registry contract (required: enforced above, so this branch always runs)
  {
    try {
      const rpcUrl = process.env.HEDERA_RPC_URL || 'https://testnet.hashio.io/api';
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      // Registry path is ECDSA-only (ethers Wallet). Documented in README;
      // still normalize via parseOperatorKey so DER / 0x / raw hex parse, but
      // ethers expects secp256k1.
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
            'Set HEDERA_KEY_TYPE=ecdsa (registry path is ECDSA-only) or ed25519 for HCS-only.',
        );
      }
      const wallet = new ethers.Wallet(walletKey, provider);
      const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, wallet);
      const tx = await registry.anchorReceipt(receipt.claimId, toBytes32(receipt.decisionHash));
      const mined = await tx.wait();
      // Reverted txs must not be reported as success.
      if (mined && typeof mined.status === 'number' && mined.status !== 1) {
        out.contract = {
          ok: false,
          error: 'Registry transaction reverted',
          address: registryAddress,
          transactionId: mined.hash ?? tx.hash,
        };
      } else {
        out.contract = {
          ok: true,
          address: registryAddress,
          transactionId: mined?.hash ?? tx.hash,
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Contract anchor failed';
      const duplicate = msg.toLowerCase().includes('already anchored');
      out.contract = {
        ok: false,
        error: sanitizeError(msg, 'Contract anchor failed'),
        duplicate: duplicate || undefined,
      };
    }
  }

  // 3 — certificate NFT. Sequenced on registry success (S4): the registry is
  // the one-anchor enforcement point, so a reverted/duplicate registry write
  // must not mint a second serial, and a registry RPC failure must not leave
  // an NFT with no registry row. mintCertificate is not internally one-shot.
  const mintSkip = mintSkipReason(receipt.verdict, out.contract.ok);
  if (mintSkip) {
    out.nft = { ok: false, skipped: mintSkip };
  } else {
    try {
      out.nft = { ok: true, ...(await anchor.mintCertificate(receipt)) };
    } catch (err) {
      out.nft = {
        ok: false,
        error: sanitizeError(err instanceof Error ? err.message : '', 'Mint failed'),
      };
    }
  }

  try {
    anchor.close();
  } catch {
    /* ignore */
  }

  // Duplicates → 409
  if (out.contract.duplicate) {
    return NextResponse.json(
      { ok: false, error: out.contract.error, ...out },
      { status: 409 },
    );
  }

  // All-failed or partial-anchor → 502 with top-level { ok: false }.
  // A skipped NFT stage (verdict-not-verified) is not a failure.
  const hcsFailed = !out.hcs.ok;
  const contractFailed = !out.contract.ok && !out.contract.skipped;
  const nftFailed = !out.nft.ok && !out.nft.skipped;
  const anyAttemptedFailure = hcsFailed || contractFailed || nftFailed;
  const anySuccess = out.hcs.ok || out.contract.ok || out.nft.ok;

  if (anyAttemptedFailure) {
    return NextResponse.json(
      {
        ok: false,
        error: anySuccess
          ? 'Partial anchor: one or more stages failed'
          : 'Anchor failed: no stage succeeded',
        ...out,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, ...out });
}
