/**
 * Build the Vera Genesis Receipt claim — the template verifying its first
 * claim: itself. Run with: npx tsx scripts/vera-genesis.ts
 * Prints { claim, receipt, report } as JSON.
 */
import { ProvenanceClient, veraGenesisClaim } from '../src/index.js';

const client = new ProvenanceClient();
const claim = veraGenesisClaim();
const { receipt, report } = client.verifyClaim(claim);
console.log(JSON.stringify({ claim, receipt, report }, null, 2));
