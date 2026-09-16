/**
 * Provenance Swarm Template — Vera Genesis Receipt claim builder
 *
 * The template verifying its first claim: itself. The origin attestation
 * names the builder, the custody chain hands the build to Stanley, and the
 * document hashes are the real sha256 of this repo's README and template.json.
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sha256 } from './hash.js';
import type { ProvenanceClaim } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

const sha256File = (p: string) =>
  createHash('sha256').update(readFileSync(p)).digest('hex');

export function veraGenesisClaim(): ProvenanceClaim {
  const builder = 'Vera';
  const builtFor = 'Stanley · livevnx8';
  const buildDate = '2026-09-16';
  const statement =
    'Genesis receipt: the provenance-swarm template verifies its first claim — itself. ' +
    'Three deterministic workers checked this build; the receipt is anchored below.';

  return {
    claimId: 'vera-genesis-001',
    product: 'Vera Genesis Receipt',
    lot: 'GENESIS-001',
    origin: {
      farm: builder,
      region: builtFor,
      harvestDate: buildDate,
      statement,
      attestationHash: sha256(`${builder}|${builtFor}|${buildDate}|${statement}`),
    },
    custody: [
      {
        holder: 'Stanley · livevnx8',
        receivedAt: '2026-09-16T13:00:00Z',
        handoffHash: sha256(`${builder}|Stanley · livevnx8|2026-09-16T13:00:00Z`),
      },
    ],
    documents: [
      { name: 'README.md', sha256: sha256File(join(repoRoot, 'README.md')) },
      { name: 'template.json', sha256: sha256File(join(repoRoot, 'template.json')) },
    ],
  };
}
