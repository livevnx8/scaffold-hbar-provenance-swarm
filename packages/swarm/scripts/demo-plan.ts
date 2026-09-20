/**
 * Provenance Swarm Template — Plan-only demo (no credentials, no network)
 *
 * Runs the verifier swarm over a fixture coffee shipment, prints the receipt,
 * then shows tamper detection on a modified copy of the same claim.
 *
 * Usage: npm run demo:plan
 */

import { ProvenanceClient, fixtureClaim } from '../src/index.js';
import type { ProvenanceClaim } from '../src/index.js';

function main(): void {
  const client = new ProvenanceClient();
  console.log('Registered agents:', client.registry.list().map(r => r.id).join(', '));

  console.log('\n=== Valid claim ===');
  const claim = fixtureClaim();
  const { receipt, report } = client.verifyClaim(claim);
  for (const r of receipt.results) {
    console.log(
      `  [${r.passed ? 'PASS' : 'FAIL'}] ${r.name} (confidence ${r.confidence.toFixed(2)})`,
    );
    for (const f of r.findings) console.log(`         - ${f}`);
  }
  console.log(`\nReceipt ${receipt.claimId}: verdict=${receipt.verdict}`);
  console.log(`  taskHash:     ${receipt.taskHash}`);
  console.log(`  decisionHash: ${receipt.decisionHash}`);
  console.log(`Double-verifier: ${report.verdict} — ${report.summary}`);

  console.log('\n=== Tampered claim (attestation hash swapped) ===');
  const tampered: ProvenanceClaim = {
    ...claim,
    claimId: 'claim-cof-042-tampered',
    origin: { ...claim.origin, attestationHash: 'f'.repeat(64) },
  };
  const bad = client.verifyClaim(tampered);
  console.log(`Receipt ${bad.receipt.claimId}: verdict=${bad.receipt.verdict}`);
  console.log(`Double-verifier: ${bad.report.verdict} — ${bad.report.summary}`);
  console.log('(the receipt is authentic; it truthfully records needs_review)');
}

main();
