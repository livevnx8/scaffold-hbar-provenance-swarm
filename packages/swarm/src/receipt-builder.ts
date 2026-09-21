/**
 * Provenance Swarm Template — Receipt builder
 *
 * Binds a claim and its worker verdicts into a tamper-evident receipt:
 *   taskHash     = sha256(canonical claim)          — what was verified
 *   decisionHash = sha256(taskHash + worker results) — what was decided
 *
 * Receipt versions:
 *   1.0 — legacy construction. The worker payload is a delimiter-framed
 *         string (`workerId:passed:confidence.toFixed(4):findings.join('|')`
 *         joined by `;`). Demonstrated collisions exist for adversarial
 *         findings (F2/F3, 2026-09-21); the verifier still accepts 1.0
 *         receipts so existing anchors remain checkable.
 *   1.1 — structured construction. Worker results are hashed as a canonical
 *         JSON object (workers sorted by workerId, confidence as fixed-point
 *         integer basis points, findings as a JSON array, version embedded).
 *         No delimiters, no float formatting, no order dependence.
 */

import {
  ProvenanceClaim,
  ProvenanceReceipt,
  ReceiptVersion,
  ProvenanceVerdict,
  WorkerVerdict,
} from './types.js';
import { sha256, canonicalize } from './hash.js';

export const RECEIPT_VERSION_1_0: ReceiptVersion = '1.0';
export const RECEIPT_VERSION_1_1: ReceiptVersion = '1.1';
/** The version new receipts are built with. */
export const CURRENT_RECEIPT_VERSION: ReceiptVersion = RECEIPT_VERSION_1_1;

export function taskHashFor(claim: ProvenanceClaim): string {
  return sha256(canonicalize(claim));
}

interface StructuredWorkerResult {
  workerId: string;
  passed: 1 | 0;
  /** Confidence in basis points (fixed-point int): Math.round(confidence * 1e4). */
  confidenceBp: number;
  findings: string[];
}

/**
 * Structured 1.1 worker payload. Findings stay human-readable strings but are
 * hashed as JSON array elements, so `|`/`;` inside a finding (including
 * claim-controlled holder/document names) cannot change the framing.
 * Workers are sorted by workerId so pipeline order does not affect the hash.
 */
function structuredWorkerPayload(results: WorkerVerdict[]): StructuredWorkerResult[] {
  return results
    .map((r): StructuredWorkerResult => ({
      workerId: r.workerId.normalize('NFC'),
      passed: r.passed ? 1 : 0,
      confidenceBp: Math.round(r.confidence * 1e4),
      findings: r.findings.map(f => f.normalize('NFC')),
    }))
    .sort((a, b) => (a.workerId < b.workerId ? -1 : a.workerId > b.workerId ? 1 : 0));
}

export function decisionHashFor(
  results: WorkerVerdict[],
  taskHash: string,
  version: ReceiptVersion = RECEIPT_VERSION_1_0,
): string {
  if (version === RECEIPT_VERSION_1_1) {
    // Version embedded in the hashed struct (binding by embedding, not concatenation).
    return sha256(canonicalize({ v: '1.1', taskHash, workers: structuredWorkerPayload(results) }));
  }
  if (version === RECEIPT_VERSION_1_0) {
    const payload = results
      .map(r => `${r.workerId}:${r.passed ? 1 : 0}:${r.confidence.toFixed(4)}:${r.findings.join('|')}`)
      .join(';');
    return sha256(`${taskHash}:${payload}`);
  }
  throw new Error(`Unsupported receipt version: ${version}`);
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
      version: CURRENT_RECEIPT_VERSION,
      timestamp: Date.now(),
      claimId: claim.claimId,
      taskHash,
      decisionHash: decisionHashFor(results, taskHash, CURRENT_RECEIPT_VERSION),
      verdict: verdictFor(results),
      results,
    };
  }
}
