import { recheckOracleEvidenceOnChain, FEED_MAX_STALENESS_SEC } from '@provenance-swarm/oracle';
import type { FeedPortFactory, OracleRecheckResult } from '@provenance-swarm/oracle';
import type { ProvenanceClaim } from '@provenance-swarm/swarm';

export interface OracleGateOptions {
  /** Anchor-time clock (unix seconds). Injected by tests; defaults to now. */
  nowSec?: number;
  /** Oldest acceptable committed round at anchor time. Defaults to FEED_MAX_STALENESS_SEC (24h). */
  maxAgeSec?: number;
}

/**
 * Anchor-time oracle gate. Runs before any HCS, registry or NFT write.
 *
 * The forge gate (anchorGate.ts) re-runs the sync worker over the posted
 * claim, which only proves the committed oracle evidence is internally
 * consistent: the price data in it is client-supplied. This gate re-reads
 * every committed Chainlink round on the server with getRoundData(roundId)
 * from the pinned proxy and requires every field to match the chain:
 *   - mismatch / unknown feed / missing evidence -> 403 (forged evidence)
 *   - committed round older than maxAgeSec       -> 403 (a real but
 *     cherry-picked historical round cannot be replayed)
 *   - feed unreachable                           -> 502 (retry later)
 * Claims without declaredValue/oracleEvidence pass through untouched.
 */
export async function oracleGate(
  claim: ProvenanceClaim,
  portFor?: FeedPortFactory,
  opts: OracleGateOptions = {},
): Promise<
  | { ok: true; recheck: OracleRecheckResult }
  | { ok: false; status: 403 | 502; error: string; recheck: OracleRecheckResult }
> {
  const recheck = await recheckOracleEvidenceOnChain(claim, portFor);
  if (!recheck.ok) {
    if (recheck.failure === 'feed-unreachable') {
      return {
        ok: false,
        status: 502,
        error:
          'Chainlink feed could not be re-read to confirm the committed round. Nothing was anchored; retry.',
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

  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const maxAgeSec = opts.maxAgeSec ?? FEED_MAX_STALENESS_SEC;
  const stale = (claim.oracleEvidence?.readings ?? []).filter(
    (r) => nowSec - r.updatedAt > maxAgeSec,
  );
  if (stale.length > 0) {
    return {
      ok: false,
      status: 403,
      error:
        `Committed Chainlink round ${stale[0].roundId} (${stale[0].pair}) is older than ` +
        `${maxAgeSec}s at anchor time. Re-run verification to commit a current round.`,
      recheck,
    };
  }
  return { ok: true, recheck };
}
