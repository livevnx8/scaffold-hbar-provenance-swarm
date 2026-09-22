/**
 * Provenance Swarm Template — Plan-only demo (no credentials, no network)
 *
 * GREEN / GREEN / RED / RED-value teach-in:
 *   1. Valid coffee fixture              -> verified (GREEN)
 *   2. Second valid claim (new lot id)   -> verified (GREEN)
 *   3. Tampered attestation              -> needs_review (RED) with per-worker refusal
 *   4. 100x declared value vs evidence   -> needs_review (RED-value) via the
 *      value-attestation worker on the pinned cassette round
 *
 * Demo determinism: the value act uses fixtureOracleEvidence() — a pinned
 * recorded round — attached to the claim before verifyClaim. attestClaimValue
 * is never invoked; no network is touched; identical hashes every run.
 *
 * Appends the recorded-anchor evidence block. Window 9 topic 0.0.10569989 is a
 * frozen historical exhibit; template live anchors must use a separate
 * HEDERA_TEMPLATE_TOPIC_ID (never write to the exhibit topic).
 *
 * Usage: npm run demo
 */

import {
  fixtureClaim,
  fixtureValueClaim,
  FIXTURE_VALUE_USD_CENTS,
} from '@provenance-swarm/swarm';
import type {
  ProvenanceClaim,
  ProvenanceReceipt,
  DoubleVerifierReport,
} from '@provenance-swarm/swarm';
import { createClient, fixtureOracleEvidence } from '../src/index.js';

function printReceipt(
  label: string,
  color: 'GREEN' | 'RED',
  receipt: ProvenanceReceipt,
  report: DoubleVerifierReport,
): void {
  console.log(`\n=== ${color}: ${label} ===`);
  for (const r of receipt.results) {
    console.log(
      `  [${r.passed ? 'PASS' : 'FAIL'}] ${r.name} (confidence ${r.confidence.toFixed(2)})`,
    );
    for (const f of r.findings) console.log(`         - ${f}`);
  }
  console.log(`\nReceipt ${receipt.claimId}: verdict=${receipt.verdict}`);
  console.log(`  taskHash:     ${receipt.taskHash}`);
  console.log(`  decisionHash: ${receipt.decisionHash}`);
  console.log(`Double-verifier: ${report.verdict}`);
  console.log(`  ${report.summary}`);
  if (color === 'RED') {
    console.log(
      '(RED) The receipt is authentic; it truthfully records needs_review. ' +
        'Refusal is the feature: a forged attestation cannot silently become verified.',
    );
  }
}

function main(): void {
  const client = createClient();
  console.log(
    'Demo plan: GREEN (fixture) -> GREEN (second lot) -> RED (tampered attestation) ' +
      '-> RED-value (100x declared value, cassette evidence)',
  );

  // GREEN 1
  const claim = fixtureClaim();
  const first = client.verifyClaim(claim);
  printReceipt('Valid coffee fixture', 'GREEN', first.receipt, first.report);

  // GREEN 2 — distinct claim id / lot, same well-formed origin (still verifies)
  const claimB: ProvenanceClaim = {
    ...claim,
    claimId: 'claim-cof-043',
    lot: 'COF-043',
  };
  const second = client.verifyClaim(claimB);
  printReceipt('Second valid lot (new claim id)', 'GREEN', second.receipt, second.report);

  // RED — tampered attestation
  const tampered: ProvenanceClaim = {
    ...claim,
    claimId: 'claim-cof-042-tampered',
    origin: { ...claim.origin, attestationHash: 'f'.repeat(64) },
  };
  const bad = client.verifyClaim(tampered);
  printReceipt('Tampered attestation hash', 'RED', bad.receipt, bad.report);

  // RED-value — 100x declared USD equivalent against the same HBAR amount,
  // evaluated against the pinned cassette round. The value worker recomputes
  // the implied USD from the committed evidence and fails the 100x ratio
  // outside the 0.5x-2x band: the oracle path can refuse.
  const valueClaim = fixtureValueClaim();
  const inflated: ProvenanceClaim = {
    ...valueClaim,
    claimId: 'claim-cof-042-value-100x',
    declaredValue: {
      ...valueClaim.declaredValue!,
      usdEquivalent: (BigInt(FIXTURE_VALUE_USD_CENTS) * 100n).toString(),
    },
    oracleEvidence: fixtureOracleEvidence(),
  };
  const redValue = client.verifyClaim(inflated);
  printReceipt(
    '100x declared value vs HBAR amount (Chainlink value worker)',
    'RED',
    redValue.receipt,
    redValue.report,
  );
  console.log(
    '(RED-value) The receipt is authentic (v1.1, cassette evidence bound into ' +
      'taskHash); it truthfully records needs_review. The value worker is ' +
      'load-bearing: a 100x declared value cannot silently become verified.',
  );

  console.log('\n=== Recorded-anchor evidence (historical exhibit; read-only) ===');
  console.log('Window 9 frozen HCS topic : 0.0.10569989  (DO NOT write from template paths)');
  console.log('Template live anchors     : set HEDERA_TEMPLATE_TOPIC_ID (separate topic; auto-create if empty)');
  console.log('Recorded HCS anchor       : topic 0.0.10569989 seq 2');
  console.log('  tx  0.0.9032608@1789565505.352869642');
  console.log('  https://hashscan.io/testnet/transaction/0.0.9032608@1789565505.352869642');
  console.log('  https://hashscan.io/testnet/topic/0.0.10569989');
  console.log('Recorded certificate NFT  : token 0.0.10569997 serial #1');
  console.log('  tx  0.0.9032608@1789565511.702573940');
  console.log('  https://hashscan.io/testnet/token/0.0.10569997');
  console.log(
    '\nNote: topic 0.0.10569989 is the Window 9 frozen tape. Template live' +
      ' anchors must never target it; use HEDERA_TEMPLATE_TOPIC_ID instead.',
  );
}

main();
