import {
  verifyProvenanceReceipt,
  ProvenanceClient,
  type ProvenanceReceipt,
  type ProvenanceClaim,
} from '../../swarm/src/index.ts';

/**
 * Server-side gate: refuse forged "verified" receipts before any HCS /
 * registry / NFT write. Requires the original claim so we can re-verify.
 * Exported for a focused Next/API unit test of the 403 forge path.
 */
export function gateReceipt(
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

  // Defence in depth: re-run the swarm and require an exact match so
  // a hand-crafted receipt that was never produced by the pipeline for the posted
  // claim cannot sail through; self-consistent fabricated claims still pass by
  // design (see Honest boundaries).
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