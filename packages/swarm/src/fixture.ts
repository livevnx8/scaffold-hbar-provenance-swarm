/**
 * Provenance Swarm Template — Fixture claim
 *
 * A valid coffee-shipment claim used by the offline demo, the test suite
 * helpers, and the frontend "load fixture" button. The attestation and
 * handoff hashes are computed with the same sha256 construction the workers
 * recompute, so this fixture verifies cleanly.
 */

import { sha256 } from './hash.js';
import { ProvenanceClaim } from './types.js';

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
      attestationHash: sha256(`${farm}|${region}|${harvestDate}|${statement}`),
    },
    custody: [
      {
        holder: 'Cooperativa Andina',
        receivedAt: '2026-03-20T09:00:00Z',
        handoffHash: sha256(`${farm}|Cooperativa Andina|2026-03-20T09:00:00Z`),
      },
      {
        holder: 'Pacific Roasters',
        receivedAt: '2026-04-02T14:30:00Z',
        handoffHash: sha256('Cooperativa Andina|Pacific Roasters|2026-04-02T14:30:00Z'),
      },
    ],
    documents: [
      { name: 'phytosanitary-certificate.pdf', sha256: 'a'.repeat(64) },
      { name: 'organic-cert.pdf', sha256: 'b'.repeat(64) },
    ],
  };
}
