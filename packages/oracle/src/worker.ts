/**
 * Provenance Swarm Template — value-attestation worker (Phase 2)
 *
 * The fourth swarm worker: checks that the claim's declared value is
 * economically plausible against the committed Chainlink evidence.
 *
 * The worker is pure and synchronous like the other three: it evaluates
 * claim.oracleEvidence — committed before the swarm runs — and never
 * touches the network or the wall clock. Same claim in, same verdict out,
 * which is what lets the anchor gate's re-run reproduce the decisionHash.
 *
 * Fail-closed rules (any => passed:false, verdict needs_review):
 * declaredValue present but oracleEvidence missing/malformed, unknown feed
 * address, non-positive or inconsistent round fields, composite mismatch,
 * evidence internally inconsistent, malformed declared value, or the
 * declared/implied ratio outside the 0.5x-2x band.
 */

import type {
  ProvenanceClaim,
  ProvenanceWorker,
  WorkerVerdict,
} from '@provenance-swarm/swarm';
import { verifyOracleEvidence } from './verifier.js';
import {
  parseDecimalInt,
  compositeUsdCents,
  ratioBasisPoints,
  formatRatio,
  formatUsd,
  formatPrice,
} from './compositor.js';

export class ValueAttestationWorker implements ProvenanceWorker {
  readonly id = 'value-attestation';
  readonly name = 'Value Attestation Verifier';
  readonly specialty = 'value';

  verify(claim: ProvenanceClaim): WorkerVerdict {
    const fail = (confidence: number, findings: string[]): WorkerVerdict => ({
      workerId: this.id,
      name: this.name,
      specialty: this.specialty,
      passed: false,
      confidence,
      findings,
    });

    // The coordinator only includes this worker when declaredValue is
    // present; running without it is a wiring bug — fail closed.
    if (!claim.declaredValue) {
      return fail(0.1, [
        'value-attestation worker ran on a claim with no declaredValue — failing closed',
      ]);
    }

    const result = verifyOracleEvidence(claim);
    const failed = result.checks.filter(c => !c.ok);

    // Narrative findings (v1.2 style): the committed round, the economics,
    // and the band verdict — human-readable, hashed as JSON array elements.
    const findings: string[] = [];
    const evidence = claim.oracleEvidence;
    const reading = evidence?.readings?.[0];
    const amount = parseDecimalInt(claim.declaredValue.amount);
    const declared = parseDecimalInt(claim.declaredValue.usdEquivalent);

    if (reading && amount !== null && declared !== null) {
      const implied = compositeUsdCents(amount, reading);
      const ratio = formatRatio(ratioBasisPoints(declared, amount, reading));
      findings.push(
        `chainlink ${reading.pair} round ${reading.roundId} @ ${reading.feedAddress}: ` +
          `answer ${reading.answer} (${reading.decimals}dp, ` +
          `${formatPrice(reading.answer, reading.decimals)}/${reading.pair.split('/')[0]}), ` +
          `updatedAt ${reading.updatedAt} (${reading.mode})`,
      );
      findings.push(
        `declared ${formatUsd(declared)} vs implied ${formatUsd(implied)} from ` +
          `${amount.toString()} smallest units @ ` +
          `${formatPrice(reading.answer, reading.decimals)}/${reading.pair.split('/')[0]} ` +
          `(ratio ${ratio}, band 0.5x-2x)`,
      );
    }

    if (!result.ok) {
      for (const c of failed) {
        findings.push(`${c.name}: ${c.detail}`);
      }
      findings.push('value attestation refused — needs_review');
      return fail(0.2, findings);
    }

    findings.push('declared/implied ratio inside the 0.5x-2x band');
    return {
      workerId: this.id,
      name: this.name,
      specialty: this.specialty,
      passed: true,
      confidence: 0.9,
      findings,
    };
  }
}
