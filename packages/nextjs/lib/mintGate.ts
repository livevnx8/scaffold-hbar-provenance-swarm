/**
 * Mint gating for /api/anchor stage 3 (S4).
 *
 * The registry is the one-anchor enforcement point: the certificate NFT may
 * only mint after the registry anchor succeeded. A reverted or duplicate
 * registry write must not mint a second serial for the same claim, and a
 * registry RPC failure must not leave an NFT with no registry row.
 * mintCertificate itself is not one-shot — every call mints a new serial —
 * so the sequencing decision lives here, pinned by mintGate.test.ts.
 */
export type MintSkipReason = 'verdict-not-verified' | 'registry-anchor-failed';

export function mintSkipReason(
  verdict: string,
  registryAnchored: boolean,
): MintSkipReason | null {
  if (verdict !== 'verified') return 'verdict-not-verified';
  if (!registryAnchored) return 'registry-anchor-failed';
  return null;
}
