/**
 * Receipt v1.1 regression tests — adversarial findings F2/F3/F4/F9 (2026-09-21).
 *
 * v1.0's delimiter-framed worker payload admitted demonstrated hash collisions.
 * v1.1 hashes a structured canonical payload instead. These tests pin the fix:
 * every collision class from the review must produce distinct hashes under 1.1,
 * legacy 1.0 receipts must still verify, and unknown versions must fail closed.
 */

import {
  ProvenanceClient,
  ProvenanceReceiptBuilder,
  decisionHashFor,
  taskHashFor,
  verifyProvenanceReceipt,
  attestationHashFor,
  handoffHashFor,
  fixtureClaim,
  WorkerVerdict,
  ProvenanceReceipt,
} from '../src/index.js';

function verdict(workerId: string, findings: string[], confidence = 0.9): WorkerVerdict {
  return { workerId, name: workerId, specialty: 'test', passed: true, confidence, findings };
}

const TASK = 't'.repeat(64);

describe('F2 delimiter collisions are dead under v1.1', () => {
  it('findings ["a|b"] and ["a","b"] hash differently under 1.1', () => {
    const a = decisionHashFor([verdict('w', ['a|b'])], TASK, '1.1');
    const b = decisionHashFor([verdict('w', ['a', 'b'])], TASK, '1.1');
    expect(a).not.toBe(b);
  });

  it('documents the legacy 1.0 collision (why 1.0 is verifiable-but-deprecated)', () => {
    const a = decisionHashFor([verdict('w', ['a|b'])], TASK, '1.0');
    const b = decisionHashFor([verdict('w', ['a', 'b'])], TASK, '1.0');
    expect(a).toBe(b);
  });

  it('a ";" inside a finding cannot split worker frames under 1.1', () => {
    const framed = decisionHashFor([verdict('w', ['x;y'])], TASK, '1.1');
    const split = decisionHashFor(
      [verdict('w', ['x']), verdict('w', ['y'])],
      TASK,
      '1.1',
    );
    expect(framed).not.toBe(split);
  });
});

describe('F3 claim-controlled collisions are dead under v1.1', () => {
  it('a "|" inside a holder name cannot reframe findings', () => {
    // Adversarial: holder "Farm|A" interpolated into a finding vs two findings.
    const evil = decisionHashFor([verdict('w', ['link 0 (Origin → Farm|A): ok'])], TASK, '1.1');
    const split = decisionHashFor([verdict('w', ['link 0 (Origin → Farm', 'A): ok'])], TASK, '1.1');
    expect(evil).not.toBe(split);
  });

  it('attestation tuple: ("Farm|A","EU") != ("Farm","A|EU")', () => {
    const a = attestationHashFor('Farm|A', 'EU', '2026-01-01', 's');
    const b = attestationHashFor('Farm', 'A|EU', '2026-01-01', 's');
    expect(a).not.toBe(b);
  });

  it('handoff tuple: ("A|B","C") != ("A","B|C")', () => {
    const a = handoffHashFor('A|B', 'C', '2026-01-01T00:00:00Z');
    const b = handoffHashFor('A', 'B|C', '2026-01-01T00:00:00Z');
    expect(a).not.toBe(b);
  });
});

describe('F9 worker order no longer affects the v1.1 hash', () => {
  it('reversed worker order gives the same decisionHash under 1.1', () => {
    const rs = [verdict('a', ['x']), verdict('b', ['y']), verdict('c', ['z'])];
    const fwd = decisionHashFor(rs, TASK, '1.1');
    const rev = decisionHashFor([...rs].reverse(), TASK, '1.1');
    expect(fwd).toBe(rev);
  });

  it('documents legacy 1.0 order dependence', () => {
    const rs = [verdict('a', ['x']), verdict('b', ['y'])];
    expect(decisionHashFor(rs, TASK, '1.0')).not.toBe(
      decisionHashFor([...rs].reverse(), TASK, '1.0'),
    );
  });
});

describe('F4 float formatting cannot leak into the v1.1 hash', () => {
  it('confidence is hashed as fixed-point integer basis points', () => {
    // 0.03125 * 1e4 = 312.5 -> Math.round -> 313; 0.03124 -> 312.
    const a = decisionHashFor([verdict('w', ['x'], 0.03125)], TASK, '1.1');
    const b = decisionHashFor([verdict('w', ['x'], 0.03124)], TASK, '1.1');
    expect(a).not.toBe(b);
    const c = decisionHashFor([verdict('w', ['x'], 0.03125)], TASK, '1.1');
    expect(a).toBe(c);
  });
});

describe('version branching in the verifier', () => {
  it('the builder stamps 1.1 and the receipt verifies', () => {
    const claim = fixtureClaim();
    const receipt = new ProvenanceReceiptBuilder().build(
      claim,
      [verdict('w', ['ok'])],
    );
    expect(receipt.version).toBe('1.1');
    const result = verifyProvenanceReceipt(receipt, claim);
    expect(result.ok).toBe(true);
  });

  it('a full 1.1 pipeline receipt verifies end to end', () => {
    const claim = fixtureClaim();
    const { receipt } = new ProvenanceClient().verifyClaim(claim);
    expect(receipt.version).toBe('1.1');
    expect(receipt.verdict).toBe('verified');
    expect(verifyProvenanceReceipt(receipt, claim).ok).toBe(true);
  });

  it('a legacy 1.0 receipt still verifies (backward compatible)', () => {
    const claim = fixtureClaim();
    const taskHash = taskHashFor(claim);
    const results = [verdict('w', ['ok'])];
    const receipt: ProvenanceReceipt = {
      version: '1.0',
      timestamp: Date.now(),
      claimId: claim.claimId,
      taskHash,
      decisionHash: decisionHashFor(results, taskHash, '1.0'),
      verdict: 'verified',
      results,
    };
    const result = verifyProvenanceReceipt(receipt, claim);
    expect(result.checks.find(c => c.name === 'decision_hash')?.ok).toBe(true);
  });

  it('an unknown receipt version fails the decision_hash check', () => {
    const claim = fixtureClaim();
    const receipt = new ProvenanceReceiptBuilder().build(claim, [verdict('w', ['ok'])]);
    const forged = { ...receipt, version: '2.0' } as unknown as ProvenanceReceipt;
    const result = verifyProvenanceReceipt(forged, claim);
    expect(result.ok).toBe(false);
    expect(result.checks.find(c => c.name === 'decision_hash')?.ok).toBe(false);
  });

  it('decisionHashFor throws on an unknown version', () => {
    expect(() =>
      decisionHashFor([verdict('w', ['x'])], TASK, '9.9' as '1.0'),
    ).toThrow(/unsupported receipt version/i);
  });
});
