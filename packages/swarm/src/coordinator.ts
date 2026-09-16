/**
 * Provenance Swarm Template — Swarm coordinator
 *
 * Thin wrapper: fan the claim out to every registered verifier worker,
 * collect the verdicts, and bind them into a receipt.
 */

import { ProvenanceClaim, ProvenanceReceipt } from './types.js';
import { ProvenanceWorker, DEFAULT_WORKERS } from './workers.js';
import { ProvenanceReceiptBuilder } from './receipt-builder.js';

export class ProvenanceSwarmCoordinator {
  constructor(private _workers: ProvenanceWorker[] = DEFAULT_WORKERS) {}

  run(claim: ProvenanceClaim): ProvenanceReceipt {
    const results = this._workers.map(worker => worker.verify(claim));
    return new ProvenanceReceiptBuilder().build(claim, results);
  }

  get workers(): ProvenanceWorker[] {
    return [...this._workers];
  }
}
