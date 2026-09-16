/**
 * Provenance Swarm Template — Agent Registry
 *
 * Thin registry over the verifier workers: register, deregister, list, and
 * materialize the worker set a coordinator should run. Mirrors the core
 * AgentRegistry template in miniature.
 */

import { ProvenanceWorker, DEFAULT_WORKERS } from './workers.js';

export interface AgentRecord {
  id: string;
  name: string;
  specialty: string;
  registeredAt: number;
}

export class AgentRegistry {
  private _agents = new Map<string, { record: AgentRecord; worker: ProvenanceWorker }>();

  register(worker: ProvenanceWorker): AgentRecord {
    if (this._agents.has(worker.id)) {
      throw new Error(`Agent ${worker.id} is already registered`);
    }
    const record: AgentRecord = {
      id: worker.id,
      name: worker.name,
      specialty: worker.specialty,
      registeredAt: Date.now(),
    };
    this._agents.set(worker.id, { record, worker });
    return record;
  }

  deregister(id: string): boolean {
    return this._agents.delete(id);
  }

  get(id: string): AgentRecord | undefined {
    return this._agents.get(id)?.record;
  }

  list(): AgentRecord[] {
    return Array.from(this._agents.values())
      .map(e => e.record)
      .sort((a, b) => a.registeredAt - b.registeredAt);
  }

  workers(): ProvenanceWorker[] {
    return this.list().map(r => this._agents.get(r.id)!.worker);
  }

  static withDefaults(): AgentRegistry {
    const registry = new AgentRegistry();
    for (const worker of DEFAULT_WORKERS) registry.register(worker);
    return registry;
  }
}
