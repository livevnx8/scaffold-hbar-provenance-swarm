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
import { fixtureValueClaim, FIXTURE_VALUE_AMOUNT_TINYBARS } from '@provenance-swarm/swarm';
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
