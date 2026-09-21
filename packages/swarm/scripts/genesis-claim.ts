/**
 * Build the Genesis Receipt claim — the template verifying its first
 * claim: itself. Run with: npx tsx scripts/genesis-claim.ts
 * Prints { claim, receipt, report } as JSON.
 */
import { ProvenanceClient, genesisClaim } from '../src/index.js';

const client = new ProvenanceClient();
const claim = genesisClaim();
const { receipt, report } = client.verifyClaim(claim);
console.log(JSON.stringify({ claim, receipt, report }, null, 2));
