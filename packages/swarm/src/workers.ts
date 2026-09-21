/**
 * Provenance Swarm Template — Deterministic verifier workers
 *
 * Three specialists, each checking one provenance dimension. All logic is
 * pure and deterministic: same claim in, same verdict out. No network, no
 * credentials, no randomness.
 */

import { ProvenanceClaim, WorkerVerdict } from './types.js';
import { isHex64, attestationHashFor, handoffHashFor } from './hash.js';

export interface ProvenanceWorker {
  readonly id: string;
  readonly name: string;
  readonly specialty: string;
  verify(claim: ProvenanceClaim): WorkerVerdict;
}

function verdict(
  worker: ProvenanceWorker,
  passed: boolean,
  confidence: number,
  findings: string[],
): WorkerVerdict {
  return {
    workerId: worker.id,
    name: worker.name,
    specialty: worker.specialty,
    passed,
    confidence: Math.max(0, Math.min(0.99, confidence)),
    findings,
  };
}

/** Recomputes the origin attestation hash and checks the payload fields. */
export class OriginAttestationWorker implements ProvenanceWorker {
  readonly id = 'origin-attestation';
  readonly name = 'Origin Attestation Verifier';
  readonly specialty = 'origin';

  verify(claim: ProvenanceClaim): WorkerVerdict {
    const findings: string[] = [];
    let passed = true;
    let confidence = 0.5;

    // Claim identity fields (inspected so the "three specialists" framing matches
    // what is actually checked — not left as free-form decoration).
    if (!claim.claimId?.trim() || !claim.product?.trim() || !claim.lot?.trim()) {
      passed = false;
      findings.push('claimId, product, and lot are required non-empty fields');
    } else {
      confidence += 0.05;
    }

    const o = claim.origin;
    // Missing origin must fail cleanly — never dereference null/undefined.
    if (!o) {
      return verdict(this, false, 0.1, ['origin attestation is missing']);
    }

    if (!o.farm || !o.region || !o.harvestDate || !o.statement) {
      passed = false;
      findings.push('origin attestation is missing required fields');
    } else {
      confidence += 0.2;
    }

    const expected = attestationHashFor(o.farm, o.region, o.harvestDate, o.statement);
    if (o.attestationHash !== expected) {
      passed = false;
      findings.push(
        `attestation hash mismatch: expected ${expected.slice(0, 12)}…, got ${(o.attestationHash || 'missing').slice(0, 12)}…`,
      );
    } else {
      confidence += 0.25;
      findings.push('attestation hash recomputes from the supplied origin fields');
    }

    // Real calendar date — reject 2026-99-99 and other regex-only impostors.
    const dateOk = (() => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(o.harvestDate ?? '');
      if (!m) return false;
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      const dt = new Date(Date.UTC(y, mo - 1, d));
      return (
        dt.getUTCFullYear() === y &&
        dt.getUTCMonth() === mo - 1 &&
        dt.getUTCDate() === d
      );
    })();
    if (!dateOk) {
      passed = false;
      findings.push('harvestDate is not a real ISO YYYY-MM-DD calendar date');
    }

    return verdict(this, passed, confidence, findings);
  }
}

/** Walks the custody chain: hash-linked handoffs in non-decreasing time order. */
export class CustodyChainWorker implements ProvenanceWorker {
  readonly id = 'custody-chain';
  readonly name = 'Custody Chain Verifier';
  readonly specialty = 'custody';

  verify(claim: ProvenanceClaim): WorkerVerdict {
    const chain = claim.custody;
    if (!Array.isArray(chain) || chain.length === 0) {
      return verdict(this, false, 0.1, ['custody chain is empty']);
    }

    const findings: string[] = [];
    let passed = true;
    let confidence = 0.5 + Math.min(0.2, 0.05 * chain.length);
    let prevHolder = claim.origin?.farm ?? '';
    let prevTime = 0;

    for (let i = 0; i < chain.length; i++) {
      const link = chain[i];
      const expected = handoffHashFor(prevHolder, link.holder, link.receivedAt);
      if (link.handoffHash !== expected) {
        passed = false;
        findings.push(`link ${i} (${prevHolder} → ${link.holder}): handoff hash mismatch`);
      }
      if (!link.holder) {
        passed = false;
        findings.push(`link ${i}: holder is empty`);
      }
      const t = Date.parse(link.receivedAt);
      if (Number.isNaN(t)) {
        passed = false;
        findings.push(`link ${i}: receivedAt is not a valid date`);
      } else if (t < prevTime) {
        passed = false;
        findings.push(`link ${i}: receivedAt moves backwards in time`);
      } else {
        prevTime = t;
      }
      prevHolder = link.holder;
    }

    if (passed) {
      confidence += 0.25;
      findings.push(`custody chain intact across ${chain.length} handoff(s)`);
    }
    return verdict(this, passed, confidence, findings);
  }
}

/** Checks that every attached document carries a well-formed SHA-256 digest. */
export class DocumentHashWorker implements ProvenanceWorker {
  readonly id = 'document-hash';
  readonly name = 'Document Hash Verifier';
  readonly specialty = 'documents';

  verify(claim: ProvenanceClaim): WorkerVerdict {
    const docs = claim.documents;
    if (!Array.isArray(docs) || docs.length === 0) {
      return verdict(this, false, 0.2, ['no provenance documents attached']);
    }

    const findings: string[] = [];
    let passed = true;
    let confidence = 0.5 + Math.min(0.2, 0.05 * docs.length);

    for (const d of docs) {
      if (!d.name) {
        passed = false;
        findings.push('a document has an empty name');
      }
      if (!isHex64(d.sha256)) {
        passed = false;
        findings.push(`document "${d.name || 'unnamed'}": sha256 is not 64-char hex`);
      }
    }

    if (passed) {
      confidence += 0.25;
      findings.push(`${docs.length} document hash(es) well-formed`);
    }
    return verdict(this, passed, confidence, findings);
  }
}

export const DEFAULT_WORKERS: ProvenanceWorker[] = [
  new OriginAttestationWorker(),
  new CustodyChainWorker(),
  new DocumentHashWorker(),
];
