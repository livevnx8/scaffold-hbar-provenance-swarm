/**
 * Gate round-trip + framing tests — the critical Phase 2 invariant.
 *
 * gateReceipt re-runs the swarm on the posted claim and requires identical
 * taskHash/decisionHash/verdict. Because the oracle worker evaluates
 * committed evidence (never live reads), the re-run is deterministic.
 * These tests replicate the gate's exact logic without importing nextjs.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyProvenanceReceipt,
  taskHashFor,
  fixtureClaim,
  fixtureValueClaim,
} from '@provenance-swarm/swarm';
import type { ProvenanceClaim } from '@provenance-swarm/swarm';
import { createClient, fixtureOracleEvidence } from '../src/index.js';

/** Mirrors gateReceipt's re-verification + re-run, minus HTTP. */
function gateCheck(receipt: Parameters<typeof verifyProvenanceReceipt>[0], claim: ProvenanceClaim) {
  const verification = verifyProvenanceReceipt(receipt, claim);
  if (!verification.ok) return { ok: false as const, verification };
  const { receipt: recomputed } = createClient().verifyClaim(claim);
  const match =
    recomputed.taskHash === receipt.taskHash &&
    recomputed.decisionHash === receipt.decisionHash &&
    recomputed.verdict === receipt.verdict;
  return { ok: match, verification, recomputed };
}

describe('gate round-trip', () => {
  test('value claim: verify → gate re-run reproduces identical hashes', () => {
    const claim = { ...fixtureValueClaim(), oracleEvidence: fixtureOracleEvidence() };
    const { receipt } = createClient().verifyClaim(claim);
    assert.equal(receipt.results.length, 4);
    assert.equal(receipt.results[3].workerId, 'value-attestation');
    assert.equal(receipt.verdict, 'verified');

    const gate = gateCheck(receipt, claim);
    assert.equal(gate.ok, true);
  });

  test('plain claim: still 3 workers, receipt byte-identical to Phase 1 shape', () => {
    const claim = fixtureClaim();
    const { receipt } = createClient().verifyClaim(claim);
    assert.equal(receipt.results.length, 3);
    assert.equal(receipt.version, '1.1');
    const gate = gateCheck(receipt, claim);
    assert.equal(gate.ok, true);
  });

  test('RED-value receipt is authentic and re-verifies (truthful refusal)', () => {
    const claim = {
      ...fixtureValueClaim(),
      oracleEvidence: fixtureOracleEvidence(),
    };
    claim.declaredValue = { ...claim.declaredValue!, usdEquivalent: '12000000' };
    const { receipt } = createClient().verifyClaim(claim);
    assert.equal(receipt.verdict, 'needs_review');
    const gate = gateCheck(receipt, claim);
    assert.equal(gate.ok, true); // the refusal itself is anchorable
  });

  test('forged verified verdict on a RED-value receipt fails the gate', () => {
    const claim = {
      ...fixtureValueClaim(),
      oracleEvidence: fixtureOracleEvidence(),
    };
    claim.declaredValue = { ...claim.declaredValue!, usdEquivalent: '12000000' };
    const { receipt } = createClient().verifyClaim(claim);
    const forged = { ...receipt, verdict: 'verified' as const };
    const gate = gateCheck(forged, claim);
    assert.equal(gate.ok, false);
  });

  test('hostile reading cannot crash the gate re-run: needs_review, not a throw', () => {
    // End-to-end pin of the worker no-throw guarantee: a reading whose
    // narrative math would throw (10n**-5n) must flow through verifyClaim
    // and the gate re-run as a truthful refusal, never an exception.
    const claim = {
      ...fixtureValueClaim(),
      oracleEvidence: fixtureOracleEvidence(),
    };
    const reading0 = claim.oracleEvidence!.readings[0];
    claim.oracleEvidence = {
      readings: [{ ...reading0, decimals: -5 }],
      compositeUsdCents: '119999',
      computedAt: reading0.updatedAt,
    };
    const { receipt } = createClient().verifyClaim(claim); // must not throw
    assert.equal(receipt.verdict, 'needs_review');
    const gate = gateCheck(receipt, claim);
    assert.equal(gate.ok, true); // the refusal itself re-verifies
  });

  test('swapped evidence after verify breaks taskHash → gate fails', () => {
    const claim = { ...fixtureValueClaim(), oracleEvidence: fixtureOracleEvidence() };
    const { receipt } = createClient().verifyClaim(claim);
    const tamperedClaim: ProvenanceClaim = {
      ...claim,
      oracleEvidence: {
        ...claim.oracleEvidence!,
        readings: [{ ...claim.oracleEvidence!.readings[0], answer: '9999999' }],
      },
    };
    const gate = gateCheck(receipt, tamperedClaim);
    assert.equal(gate.ok, false); // task_hash check fails
  });
});

describe('F2/F3 framing regression — evidence is structured, not delimiter-joined', () => {
  test('delimiter injection in evidence fields cannot shift framing', () => {
    // The F2/F3 collision class: delimiter-joined preimages let "a|b" + "c"
    // collide with "a" + "b|c". Evidence is canonicalized as structured
    // JSON, so field boundaries are unambiguous — these MUST differ.
    const base = { ...fixtureValueClaim(), oracleEvidence: fixtureOracleEvidence() };
    const h1 = taskHashFor(base);

    const moved: ProvenanceClaim = {
      ...base,
      oracleEvidence: {
        ...base.oracleEvidence!,
        readings: [
          {
            ...base.oracleEvidence!.readings[0],
            pair: 'HBAR/USD|x',
            roundId: base.oracleEvidence!.readings[0].roundId.replace('1', ''), // compensate length
          },
        ],
      },
    };
    assert.notEqual(taskHashFor(moved), h1);
  });

  test('any evidence field change moves taskHash', () => {
    const base = { ...fixtureValueClaim(), oracleEvidence: fixtureOracleEvidence() };
    const h = taskHashFor(base);
    for (const mutate of [
      (c: ProvenanceClaim) => {
        c.oracleEvidence!.readings[0].roundId = '18446744073709595482';
      },
      (c: ProvenanceClaim) => {
        c.oracleEvidence!.readings[0].answer = '9308268';
      },
      (c: ProvenanceClaim) => {
        c.oracleEvidence!.computedAt += 1;
      },
      (c: ProvenanceClaim) => {
        c.declaredValue!.usdEquivalent = '120001';
      },
    ]) {
      const copy: ProvenanceClaim = JSON.parse(JSON.stringify(base));
      mutate(copy);
      assert.notEqual(taskHashFor(copy), h);
    }
  });

  test('declaredValue presence changes the worker set and the hash', () => {
    const plain = fixtureClaim();
    const valued = { ...fixtureValueClaim(), oracleEvidence: fixtureOracleEvidence() };
    const r1 = createClient().verifyClaim(plain).receipt;
    const r2 = createClient().verifyClaim(valued).receipt;
    assert.equal(r1.results.length, 3);
    assert.equal(r2.results.length, 4);
    assert.notEqual(r1.decisionHash, r2.decisionHash);
  });
});
