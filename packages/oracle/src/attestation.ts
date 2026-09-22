/**
 * Provenance Swarm Template — value attestation (async boundary)
 *
 * attestClaimValue is the ONLY place the oracle touches the network and the
 * wall clock. It runs before the swarm in /api/verify, observes the live
 * Chainlink round for the declared currency, enforces freshness, and commits
 * the observation into claim.oracleEvidence. After this boundary everything
 * is deterministic: the worker, the verifier, and the anchor gate's re-run
 * all evaluate the same committed evidence.
 *
 * Failure contract (fail closed — the caller turns this into 502/400, never
 * a receipt):
 *   - malformed declaredValue          -> AttestationError, kind 'client'
 *   - feed unreachable / bad response  -> AttestationError, kind 'feed'
 *   - stale or future-dated round      -> AttestationError, kind 'feed'
 */

import type {
  ProvenanceClaim,
  OracleEvidence,
  FeedReading,
} from '@provenance-swarm/swarm';
import {
  feedForCurrency,
  FEED_MAX_STALENESS_SEC,
  FEED_FUTURE_SKEW_SEC,
} from './feeds.js';
import { HashioPriceFeed, type PriceFeedPort } from './reader.js';
import { compositeUsdCents, declaredValueError, parseDecimalInt } from './compositor.js';

export type AttestationErrorKind = 'client' | 'feed';

export class AttestationError extends Error {
  constructor(
    message: string,
    readonly kind: AttestationErrorKind,
  ) {
    super(message);
    this.name = 'AttestationError';
  }
}

/**
 * Observe the live round for the claim's declared currency and attach
 * oracleEvidence. Returns a NEW claim object (input is not mutated).
 * Throws AttestationError on any failure — never returns partial evidence.
 */
export async function attestClaimValue(
  claim: ProvenanceClaim,
  port?: PriceFeedPort,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<ProvenanceClaim> {
  const shapeError = declaredValueError(claim.declaredValue);
  if (shapeError) {
    throw new AttestationError(shapeError, 'client');
  }
  const value = claim.declaredValue!;
  const spec = feedForCurrency(value.currency)!;

  const feed = port ?? new HashioPriceFeed(spec.address, spec.pair);
  let reading: FeedReading;
  try {
    reading = await feed.getLatestRound();
  } catch (err) {
    throw new AttestationError(
      `oracle feed ${spec.pair} unreachable: ${err instanceof Error ? err.message : String(err)}`,
      'feed',
    );
  }

  // Freshness is enforced here — the only honest wall-clock read. The sync
  // path never re-checks age (it would make the gate non-deterministic).
  const age = nowSec - reading.updatedAt;
  if (age > FEED_MAX_STALENESS_SEC) {
    throw new AttestationError(
      `oracle feed ${spec.pair} round is stale: updatedAt ${reading.updatedAt} is ${age}s old ` +
        `(max ${FEED_MAX_STALENESS_SEC}s)`,
      'feed',
    );
  }
  if (age < -FEED_FUTURE_SKEW_SEC) {
    throw new AttestationError(
      `oracle feed ${spec.pair} round is dated ${-age}s in the future ` +
        `(max skew ${FEED_FUTURE_SKEW_SEC}s)`,
      'feed',
    );
  }

  const amount = parseDecimalInt(value.amount)!;
  const evidence: OracleEvidence = {
    readings: [reading],
    compositeUsdCents: compositeUsdCents(amount, reading).toString(),
    computedAt: nowSec,
  };

  return { ...claim, oracleEvidence: evidence };
}
