/**
 * Focused Next/API unit test for the /api/anchor forge gate.
 * Judges flagged missing Next/API tests; this covers the 403 path only.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureClaim, ProvenanceClient } from '@provenance-swarm/swarm';
import { gateReceipt } from './anchorGate.js';

describe('gateReceipt (POST /api/anchor forge gate)', () => {
  it('accepts a freshly verified claim+receipt pair', () => {
    const claim = fixtureClaim();
    const { receipt } = new ProvenanceClient().verifyClaim(claim);
    const gate = gateReceipt(receipt, claim);
    assert.deepEqual(gate, { ok: true });
  });

  it('returns 403 when decisionHash is tampered', () => {
    const claim = fixtureClaim();
    const { receipt } = new ProvenanceClient().verifyClaim(claim);
    const forged = { ...receipt, decisionHash: '0'.repeat(64) };
    const gate = gateReceipt(forged, claim);
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.status, 403);
      assert.match(gate.error.toLowerCase(), /forged|refusing|verification/);
    }
  });

  it('returns 400 when claim is missing', () => {
    const claim = fixtureClaim();
    const { receipt } = new ProvenanceClient().verifyClaim(claim);
    const gate = gateReceipt(receipt, undefined);
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.status, 400);
    }
  });
});
