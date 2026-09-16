/**
 * Provenance Swarm Template — Receipt builder
 *
 * Binds a claim and its worker verdicts into a tamper-evident receipt:
 *   taskHash     = sha256(canonical claim)          — what was verified
 *   decisionHash = sha256(taskHash + worker results) — what was decided
 */

import {
  ProvenanceClaim,
  ProvenanceReceipt,
  ProvenanceVerdict,
  WorkerVerdict,
} from './types.js';
import { sha256, canonicalize } from './hash.js';

export function taskHashFor(claim: ProvenanceClaim): string {
  return sha256(canonicalize(claim));
}

export function decisionHashFor(results: WorkerVerdict[], taskHash: string): string {
  const payload = results
    .map(r => `${r.workerId}:${r.passed ? 1 : 0}:${r.confidence.toFixed(4)}:${r.findings.join('|')}`)
    .join(';');
  return sha256(`${taskHash}:${payload}`);
}

export function verdictFor(results: WorkerVerdict[]): ProvenanceVerdict {
  if (results.length === 0) return 'rejected';
  const passed = results.filter(r => r.passed).length;
  if (passed === results.length) return 'verified';
  if (passed === 0) return 'rejected';
  return 'needs_review';
}

export class ProvenanceReceiptBuilder {
  build(claim: ProvenanceClaim, results: WorkerVerdict[]): ProvenanceReceipt {
    const taskHash = taskHashFor(claim);
    return {
      version: '1.0',
      timestamp: Date.now(),
      claimId: claim.claimId,
      taskHash,
      decisionHash: decisionHashFor(results, taskHash),
      verdict: verdictFor(results),
      results,
    };
  }
}
