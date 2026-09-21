import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { ProvenanceClient, taskHashFor, decisionHashFor } from '@provenance-swarm/swarm';
import type { ProvenanceClaim } from '@provenance-swarm/swarm';

const REGISTRY_ABI = [
  'function getAnchor(string calldata claimId) external view returns (bytes32 decisionHash, uint64 anchoredAt, address anchoredBy)',
  'function verifyReceipt(string calldata claimId, bytes32 decisionHash) external view returns (bool)',
];

/**
 * Check a receipt against the on-chain registry.
 *
 * Modes:
 * - claim-reverified: caller posts the claim; we recompute taskHash/decisionHash
 *   via the swarm and only then compare to the registry (full provenance check).
 * - hash-equality-only: caller posts claimId + decisionHash only. A match proves
 *   the registry holds that hash for that claimId (first-writer-wins). It does
 *   NOT prove the presenter owns a valid claim that produces that hash — treat
 *   as ownership-of-hash, not full provenance verification.
 */
export async function POST(req: Request) {
  let body: {
    claimId?: string;
    decisionHash?: string;
    claim?: ProvenanceClaim;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { claimId, decisionHash, claim } = body;
  if (!claimId || !decisionHash) {
    return NextResponse.json({ error: 'claimId and decisionHash are required' }, { status: 400 });
  }

  let mode: 'claim-reverified' | 'hash-equality-only' = 'hash-equality-only';
  let effectiveDecisionHash = decisionHash;
  let claimChecks: unknown = undefined;

  if (claim) {
    if (claim.claimId !== claimId) {
      return NextResponse.json(
        { error: `claim.claimId (${claim.claimId}) does not match claimId (${claimId})` },
        { status: 400 },
      );
    }
    const { receipt } = new ProvenanceClient().verifyClaim(claim);
    const expectedTask = taskHashFor(claim);
    const expectedDecision = decisionHashFor(receipt.results, receipt.taskHash);
    if (receipt.taskHash !== expectedTask || receipt.decisionHash !== expectedDecision) {
      return NextResponse.json(
        {
          match: false,
          mode: 'claim-reverified',
          error: 'Claim failed local swarm recomputation before registry lookup.',
        },
        { status: 400 },
      );
    }
    if (receipt.decisionHash.toLowerCase().replace(/^0x/, '') !==
        decisionHash.toLowerCase().replace(/^0x/, '')) {
      return NextResponse.json({
        match: false,
        mode: 'claim-reverified',
        error:
          'Posted decisionHash does not match the decisionHash recomputed from the claim. ' +
          'Refusing registry lookup. This is not a valid provenance presentation.',
        recomputedDecisionHash: receipt.decisionHash,
      });
    }
    mode = 'claim-reverified';
    effectiveDecisionHash = receipt.decisionHash;
    claimChecks = {
      taskHash: receipt.taskHash,
      decisionHash: receipt.decisionHash,
      verdict: receipt.verdict,
    };
  }

  const registryAddress = process.env.HEDERA_REGISTRY_ADDRESS;
  if (!registryAddress) {
    return NextResponse.json(
      {
        error:
          'No registry contract configured. Deploy one with: npm run deploy:testnet --workspace=@provenance-swarm/contracts',
        mode,
        note:
          mode === 'hash-equality-only'
            ? 'Without a claim, even a configured registry only proves hash-equality (first-writer-wins), not full provenance.'
            : undefined,
      },
      { status: 400 },
    );
  }

  try {
    const rpcUrl = process.env.HEDERA_RPC_URL || 'https://testnet.hashio.io/api';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);
    const clean = effectiveDecisionHash.startsWith('0x')
      ? effectiveDecisionHash
      : '0x' + effectiveDecisionHash;

    let match: boolean;
    try {
      match = await registry.verifyReceipt(claimId, clean);
    } catch {
      return NextResponse.json({
        match: false,
        mode,
        claimChecks,
        error: 'Registry lookup failed',
      });
    }
    if (!match) return NextResponse.json({ match: false, mode, claimChecks });

    const [hash, anchoredAt, anchoredBy] = await registry.getAnchor(claimId);
    return NextResponse.json({
      match: true,
      mode,
      decisionHash: hash as string,
      anchoredAt: new Date(Number(anchoredAt) * 1000).toLocaleString(),
      anchoredBy: anchoredBy as string,
      claimChecks,
      note:
        mode === 'hash-equality-only'
          ? 'Hash-equality only: the registry holds this decisionHash for this claimId (first-writer-wins). ' +
            'This does not by itself prove claim ownership or that the hash was derived from a valid claim. ' +
            'Post the claim to upgrade to claim-reverified mode.'
          : 'Claim-reverified: decisionHash was recomputed from the posted claim before the registry match.',
    });
  } catch (err) {
    return NextResponse.json(
      { match: false, mode, error: err instanceof Error ? err.message : 'Lookup failed' },
      { status: 500 },
    );
  }
}
