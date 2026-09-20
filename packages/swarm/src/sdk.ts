/**
 * Provenance Swarm Template — Thin SDK client
 *
 * The "thin wrapper template": registry → coordinator → receipt →
 * Hiero double-verifier, wired in one call. No credentials, no network.
 */

import { ProvenanceClaim, ProvenanceReceipt } from './types.js';
import { ProvenanceSwarmCoordinator } from './coordinator.js';
import { AgentRegistry } from './agent-registry.js';
import { HieroDoubleVerifier, DoubleVerifierReport } from './verifier.js';

export interface ProvenanceVerification {
  receipt: ProvenanceReceipt;
  report: DoubleVerifierReport;
}

export class ProvenanceClient {
  private _coordinator: ProvenanceSwarmCoordinator;
  private _verifier = new HieroDoubleVerifier();

  constructor(private _registry: AgentRegistry = AgentRegistry.withDefaults()) {
    this._coordinator = new ProvenanceSwarmCoordinator(_registry.workers());
  }

  /** Verify a claim end-to-end: run the swarm, then double-verify the receipt. */
  verifyClaim(claim: ProvenanceClaim): ProvenanceVerification {
    const receipt = this._coordinator.run(claim);
    const report = this._verifier.verify(receipt, claim);
    return { receipt, report };
  }

  get registry(): AgentRegistry {
    return this._registry;
  }
}
