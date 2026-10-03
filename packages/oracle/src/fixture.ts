/**
 * Provenance Swarm Template — pinned oracle evidence (cassette)
 *
 * fixtureOracleEvidence() returns the committed-evidence object built on the
 * recorded HBAR/USD cassette round. Used by the offline demo and unit tests —
 * never by the live path. The mode:'cassette' marker is carried in the
 * reading itself so a cassette is never presented as live evidence.
 *
 * computedAt equals the round's updatedAt: the evidence-consistency check
 * requires computedAt >= max(readings[].updatedAt), and equality is the
 * honest statement for a recording made at observation time.
 */

import type { OracleEvidence } from '@provenance-swarm/swarm';
import {
  fixtureValueClaim,
  FIXTURE_VALUE_AMOUNT_TINYBARS,
  FIXTURE_VALUE_USD_CENTS,
} from '@provenance-swarm/swarm';
import { CHAINLINK_CASSETTE_READING } from './feeds.js';
import { compositeUsdCents, parseDecimalInt } from './compositor.js';

export function fixtureOracleEvidence(): OracleEvidence {
  const amount = parseDecimalInt(FIXTURE_VALUE_AMOUNT_TINYBARS)!;
  return {
    readings: [{ ...CHAINLINK_CASSETTE_READING }],
    compositeUsdCents: compositeUsdCents(amount, CHAINLINK_CASSETTE_READING).toString(),
    computedAt: CHAINLINK_CASSETTE_READING.updatedAt,
  };
}

/** The value fixture with cassette evidence attached — verifies GREEN offline. */
export function fixtureValueClaimWithEvidence() {
  return { ...fixtureValueClaim(), oracleEvidence: fixtureOracleEvidence() };
}

/**
 * A forged value claim for the anchor-time re-check: the declared USD value is
 * inflated 100x and the committed round's answer is inflated 100x to match,
 * relabelled mode:'live', with the composite recomputed. The sync worker
 * accepts it (the evidence is internally consistent); only re-reading
 * getRoundData(roundId) on-chain exposes the forged answer.
 */
export function fixtureForgedValueClaim() {
  const base = fixtureValueClaim();
  const reading = {
    ...CHAINLINK_CASSETTE_READING,
    answer: (BigInt(CHAINLINK_CASSETTE_READING.answer) * 100n).toString(),
    mode: 'live' as const,
  };
  const amount = parseDecimalInt(FIXTURE_VALUE_AMOUNT_TINYBARS)!;
  return {
    ...base,
    claimId: 'claim-cof-042-value-forged-round',
    declaredValue: {
      ...base.declaredValue!,
      usdEquivalent: (BigInt(FIXTURE_VALUE_USD_CENTS) * 100n).toString(),
    },
    oracleEvidence: {
      readings: [reading],
      compositeUsdCents: compositeUsdCents(amount, reading).toString(),
      computedAt: reading.updatedAt,
    },
  };
}
