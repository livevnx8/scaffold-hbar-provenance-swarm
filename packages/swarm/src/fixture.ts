/**
 * Provenance Swarm Template — Fixture claim
 *
 * A valid coffee-shipment claim used by the offline demo, the test suite
 * helpers, and the frontend "load fixture" button. The attestation and
 * handoff hashes are computed with the same sha256 construction the workers
 * recompute, so this fixture verifies cleanly.
 */

import { attestationHashFor, handoffHashFor } from './hash.js';
import { ProvenanceClaim } from './types.js';

/**
 * Declared value for the value-attestation fixture: $1,200.00 against
 * 12,891.76599682 HBAR. At the pinned cassette round ($0.09308267/HBAR) the
 * implied value is $1,199.99 — ratio 1.00x, inside the 0.5x–2x band, so the
 * fixture verifies GREEN once oracle evidence is attached. A 100x declared
 * equivalent ($120,000) fails the band (the RED-value demo path).
 * Amounts are decimal strings in smallest units (tinybar) and USD cents.
 */
export const FIXTURE_VALUE_AMOUNT_TINYBARS = '1289176599682';
export const FIXTURE_VALUE_USD_CENTS = '120000';

/**
 * The base fixture plus declared value terms — WITHOUT oracle evidence.
 * Served by /api/fixture; the verify route attaches live evidence via
 * attestClaimValue(). The offline demo attaches fixtureOracleEvidence()
 * from @provenance-swarm/oracle instead.
 */
export function fixtureValueClaim(): ProvenanceClaim {
  return {
    ...fixtureClaim(),
    claimId: 'claim-cof-042-value',
    declaredValue: {
      amount: FIXTURE_VALUE_AMOUNT_TINYBARS,
      currency: 'HBAR',
      usdEquivalent: FIXTURE_VALUE_USD_CENTS,
    },
  };
}

export function fixtureClaim(): ProvenanceClaim {
  const farm = 'Finca Santa Rosa';
  const region = 'Huila, Colombia';
  const harvestDate = '2026-03-15';
  const statement = 'Lot COF-042: 60kg washed-process arabica, certified organic.';
  return {
    claimId: 'claim-cof-042',
    product: 'Washed Arabica Coffee',
    lot: 'COF-042',
    origin: {
      farm,
      region,
      harvestDate,
      statement,
      attestationHash: attestationHashFor(farm, region, harvestDate, statement),
    },
    custody: [
      {
        holder: 'Cooperativa Andina',
        receivedAt: '2026-03-20T09:00:00Z',
        handoffHash: handoffHashFor(farm, 'Cooperativa Andina', '2026-03-20T09:00:00Z'),
      },
      {
        holder: 'Pacific Roasters',
        receivedAt: '2026-04-02T14:30:00Z',
        handoffHash: handoffHashFor('Cooperativa Andina', 'Pacific Roasters', '2026-04-02T14:30:00Z'),
      },
    ],
    documents: [
      { name: 'phytosanitary-certificate.pdf', sha256: 'a'.repeat(64) },
      { name: 'organic-cert.pdf', sha256: 'b'.repeat(64) },
    ],
  };
}
