import { recheckOracleEvidenceOnChain } from '@provenance-swarm/oracle';
import type { FeedPortFactory, OracleRecheckResult } from '@provenance-swarm/oracle';
import type { ProvenanceClaim } from '@provenance-swarm/swarm';

/**
 * Anchor-time oracle gate. Runs before any HCS, registry or NFT write.
 *
 * The forge gate (anchorGate.ts) re-runs the sync worker over the posted
 * claim, which only proves the committed oracle evidence is internally
 * consistent. This gate re-reads every committed Chainlink round with
 * getRoundData(roundId) and requires it to match the chain:
 *   - mismatch / unknown feed / missing evidence -> 403 (forged evidence)
 *   - feed unreachable                           -> 502 (retry later)
 * Claims without declaredValue/oracleEvidence pass through untouched.
 */
export async function oracleGate(
  claim: ProvenanceClaim,
  portFor?: FeedPortFactory,
): Promise<
  | { ok: true; recheck: OracleRecheckResult }
  | { ok: false; status: 403 | 502; error: string; recheck: OracleRecheckResult }
> {
  const recheck = await recheckOracleEvidenceOnChain(claim, portFor);
  if (recheck.ok) return { ok: true, recheck };
  if (recheck.failure === 'feed-unreachable') {
    return {
      ok: false,
      status: 502,
      error: 'Chainlink feed could not be re-read to confirm the committed round. Nothing was anchored; retry.',
      recheck,
    };
  }
  return {
    ok: false,
    status: 403,
    error:
      'Committed oracle evidence does not match the on-chain Chainlink round ' +
      `(${recheck.failure}). Forged evidence is not anchored.`,
    recheck,
  };
}
