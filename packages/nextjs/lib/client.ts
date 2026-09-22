import { createClient } from '@provenance-swarm/oracle';

/**
 * THE critical wiring invariant: /api/verify and the anchor gate's re-run
 * must execute the identical worker set for a given claim, or the gate's
 * recomputed decisionHash never matches and legitimate receipts 403.
 * Both paths import this single factory — do not construct ProvenanceClient
 * directly anywhere in the app.
 */
export { createClient };
