/**
 * Provenance Swarm Template — shared client factory
 *
 * THE critical wiring invariant: /api/verify and the anchor gate's re-run
 * must execute the identical worker set for a given claim, or the gate's
 * recomputed decisionHash never matches and legitimate receipts 403.
 * createClient() is the single factory both paths use.
 *
 * Worker inclusion is conditional on claim shape (matching the v1.2
 * reference semantics): a claim carrying declaredValue runs four workers
 * (the three deterministic specialists + value-attestation); a claim
 * without it runs the original three — so plain claims produce receipts
 * byte-identical to the pre-Phase-2 pipeline.
 */

import {
  ProvenanceSwarmCoordinator,
  HieroDoubleVerifier,
  DEFAULT_WORKERS,
} from '@provenance-swarm/swarm';
import type {
  ProvenanceClaim,
  ProvenanceVerification,
  ProvenanceWorker,
} from '@provenance-swarm/swarm';
import { ValueAttestationWorker } from './worker.js';

export class OracleProvenanceClient {
  private _verifier = new HieroDoubleVerifier();

  /** Verify a claim end-to-end: run the swarm, then double-verify the receipt. */
  verifyClaim(claim: ProvenanceClaim): ProvenanceVerification {
    const workers: ProvenanceWorker[] = [...DEFAULT_WORKERS];
    if (claim.declaredValue) {
      workers.push(new ValueAttestationWorker());
    }
    const receipt = new ProvenanceSwarmCoordinator(workers).run(claim);
    const report = this._verifier.verify(receipt, claim);
    return { receipt, report };
  }
}

/** The single client factory for both the verify route and the anchor gate. */
export function createClient(): OracleProvenanceClient {
  return new OracleProvenanceClient();
}
