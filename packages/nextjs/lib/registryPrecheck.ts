/**
 * Registry pre-check for POST /api/anchor.
 *
 * The registry is the one-anchor-per-claim enforcement point, but the HCS
 * message is written first. Without a pre-check a duplicate claim paid for an
 * HCS message and only then got 409 from the registry. Reading getAnchor
 * first refuses duplicates before any paid write:
 *   - getAnchor returns          -> 409, already anchored
 *   - reverts "unknown claim"    -> ok, proceed
 *   - any other failure          -> 502, fail closed (nothing written)
 * The registry write itself still enforces uniqueness (races are refused
 * on-chain); this only avoids paying for a doomed HCS message.
 */
export interface RegistryReader {
  getAnchor(claimId: string): Promise<unknown>;
}

function isUnknownClaimRevert(err: unknown): boolean {
  const e = err as { reason?: unknown; shortMessage?: unknown; message?: unknown } | null;
  return [e?.reason, e?.shortMessage, e?.message].some(
    (v) => typeof v === 'string' && v.includes('unknown claim'),
  );
}

export async function registryPrecheck(
  reader: RegistryReader,
  claimId: string,
): Promise<{ ok: true } | { ok: false; status: 409 | 502; error: string; duplicate?: true }> {
  try {
    await reader.getAnchor(claimId);
    return {
      ok: false,
      status: 409,
      duplicate: true,
      error: 'This claim is already anchored on-chain',
    };
  } catch (err) {
    if (isUnknownClaimRevert(err)) return { ok: true };
    return {
      ok: false,
      status: 502,
      error: 'Could not read the registry to check for an existing anchor. Nothing was written; retry.',
    };
  }
}
