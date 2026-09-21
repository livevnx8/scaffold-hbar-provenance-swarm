/**
 * Provenance Swarm Template — Receipt verifier + Hiero double-verifier
 *
 * verifyProvenanceReceipt recomputes both hashes and checks that the verdict
 * is consistent with the worker results. HieroDoubleVerifier wraps it as a
 * first-class agent with two check groups that must both pass:
 *   Pass A — hash integrity (task_hash, decision_hash recomputation)
 *   Pass B — policy (verdict_consistency, worker_quorum)
 * The groups are not independent verifiers: both run inside the one
 * verifyProvenanceReceipt call, and disagreement is reject-on-any-fail.
 */

import {
  ProvenanceClaim,
  ProvenanceReceipt,
  ReceiptVersion,
  VerificationCheck,
  VerificationResult,
} from './types.js';
import {
  taskHashFor,
  decisionHashFor,
  verdictFor,
  RECEIPT_VERSION_1_0,
  RECEIPT_VERSION_1_1,
} from './receipt-builder.js';

function check(name: string, ok: boolean, detail: string): VerificationCheck {
  return { name, ok, detail };
}

export function verifyProvenanceReceipt(
  receipt: ProvenanceReceipt,
  claim: ProvenanceClaim,
): VerificationResult {
  const checks: VerificationCheck[] = [];

  const expectedTaskHash = taskHashFor(claim);
  checks.push(
    check(
      'task_hash',
      receipt.taskHash === expectedTaskHash,
      receipt.taskHash === expectedTaskHash
        ? expectedTaskHash
        : `expected ${expectedTaskHash}, got ${receipt.taskHash}`,
    ),
  );

  const expectedDecisionHash = (() => {
    try {
      const v: ReceiptVersion = receipt.version;
      if (v !== RECEIPT_VERSION_1_0 && v !== RECEIPT_VERSION_1_1) {
        return null;
      }
      return decisionHashFor(receipt.results, receipt.taskHash, v);
    } catch {
      return null;
    }
  })();
  checks.push(
    check(
      'decision_hash',
      expectedDecisionHash !== null && receipt.decisionHash === expectedDecisionHash,
      expectedDecisionHash === null
        ? `unsupported receipt version: ${String(receipt.version)}`
        : receipt.decisionHash === expectedDecisionHash
          ? expectedDecisionHash
          : `expected ${expectedDecisionHash}, got ${receipt.decisionHash}`,
    ),
  );

  const expectedVerdict = verdictFor(receipt.results);
  const passing = receipt.results.filter(r => r.passed).length;
  checks.push(
    check(
      'verdict_consistency',
      receipt.verdict === expectedVerdict,
      receipt.verdict === expectedVerdict
        ? `verdict "${receipt.verdict}" matches ${passing}/${receipt.results.length} passing workers`
        : `expected verdict "${expectedVerdict}", got "${receipt.verdict}"`,
    ),
  );

  const quorumOk =
    receipt.results.length > 0 &&
    receipt.results.every(r => typeof r.passed === 'boolean' && !!r.workerId);
  checks.push(
    check(
      'worker_quorum',
      quorumOk,
      quorumOk
        ? `${receipt.results.length} worker verdict(s) reported`
        : 'worker results missing or malformed',
    ),
  );

  return { ok: checks.every(c => c.ok), checks };
}

export type DoubleVerifierVerdict = 'accepted' | 'rejected';

export interface DoubleVerifierReport {
  agentId: 'hiero-double-verifier';
  agentName: 'Hiero Double Verifier';
  verdict: DoubleVerifierVerdict;
  summary: string;
  checks: VerificationCheck[];
}

const PASS_A = ['task_hash', 'decision_hash'];
const PASS_B = ['verdict_consistency', 'worker_quorum'];

export class HieroDoubleVerifier {
  readonly id = 'hiero-double-verifier' as const;
  readonly name = 'Hiero Double Verifier';

  verify(receipt: ProvenanceReceipt, claim: ProvenanceClaim): DoubleVerifierReport {
    const result = verifyProvenanceReceipt(receipt, claim);
    const pass = (names: string[]): boolean =>
      names.every(n => result.checks.find(c => c.name === n)?.ok === true);
    const passA = pass(PASS_A);
    const passB = pass(PASS_B);
    const ok = result.ok && passA && passB;
    const passedCount = result.checks.filter(c => c.ok).length;

    return {
      agentId: this.id,
      agentName: this.name,
      verdict: ok ? 'accepted' : 'rejected',
      summary:
        `${passedCount}/${result.checks.length} checks passed ` +
        `(pass A hash-integrity: ${passA ? 'ok' : 'FAILED'}, ` +
        `pass B policy: ${passB ? 'ok' : 'FAILED'}) for claim ${receipt.claimId}`,
      checks: result.checks,
    };
  }
}
