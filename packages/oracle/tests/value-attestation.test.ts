/**
 * Value-attestation tests: compositor math, worker verdicts, verifier
 * check groups. All evidence is the pinned cassette — no network.
 *
 * Cassette round: HBAR/USD 0x59bC…B4a, roundId 18446744073709595481,
 * answer 9308267 (8dp → $0.09308267/HBAR), updatedAt 1790031828.
 * Fixture: 1289176599682 tinybar → implied ≈ $1,199.99 (119999 cents).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureValueClaim } from '@provenance-swarm/swarm';
import type { FeedReading, ProvenanceClaim } from '@provenance-swarm/swarm';
import {
  CHAINLINK_CASSETTE_READING,
  CHAINLINK_FEEDS_TESTNET,
  FEED_FUTURE_SKEW_SEC,
  compositeUsdCents,
  withinBand,
  ratioBasisPoints,
  parseDecimalInt,
  declaredValueError,
  verifyOracleEvidence,
  ValueAttestationWorker,
  fixtureOracleEvidence,
  fixtureValueClaimWithEvidence,
} from '../src/index.js';

function valueClaim(): ProvenanceClaim {
  return fixtureValueClaimWithEvidence();
}

function readingWith(overrides: Partial<FeedReading>): FeedReading {
  return { ...CHAINLINK_CASSETTE_READING, ...overrides };
}

function claimWithEvidence(evidence: Partial<ProvenanceClaim['oracleEvidence'] & object>): ProvenanceClaim {
  const base = fixtureValueClaim();
  return {
    ...base,
    oracleEvidence: { ...fixtureOracleEvidence(), ...evidence },
  };
}

describe('compositor', () => {
  test('compositeUsdCents: fixture amount at cassette ≈ 119999 cents', () => {
    const cents = compositeUsdCents(1289176599682n, CHAINLINK_CASSETTE_READING);
    assert.equal(cents, 119999n);
  });

  test('band edges are inclusive: 0.5x and just-under-2x pass', () => {
    // Exact implied is 119999.99999992… cents: 60000 is ratio 0.50000000x
    // (inclusive edge) and 239998 is ratio 1.99998x — both inside [0.5, 2].
    // The decision uses the exact rational, not the floored cent value.
    const amount = 1289176599682n;
    assert.equal(withinBand(60000n, amount, CHAINLINK_CASSETTE_READING), true);
    assert.equal(withinBand(239998n, amount, CHAINLINK_CASSETTE_READING), true);
  });

  test('just outside the band fails: 0.49x and 2.00000002x', () => {
    const amount = 1289176599682n;
    assert.equal(withinBand(59999n, amount, CHAINLINK_CASSETTE_READING), false);
    // 240000/119999.99… = 2.0000000167x — just over the edge, correctly refused.
    assert.equal(withinBand(240000n, amount, CHAINLINK_CASSETTE_READING), false);
  });

  test('parseDecimalInt rejects non-integers, negatives, floats, empty', () => {
    assert.equal(parseDecimalInt('120000'), 120000n);
    assert.equal(parseDecimalInt(''), null);
    assert.equal(parseDecimalInt('-5'), null);
    assert.equal(parseDecimalInt('1.5'), null);
    assert.equal(parseDecimalInt('abc'), null);
    assert.equal(parseDecimalInt('12e3'), null);
    assert.equal(parseDecimalInt(120000), null); // numbers rejected — strings only
    assert.equal(parseDecimalInt(undefined), null);
  });

  test('declaredValueError: shape validation', () => {
    assert.equal(declaredValueError(undefined), 'declaredValue is missing');
    assert.ok(declaredValueError({ amount: '0', currency: 'HBAR', usdEquivalent: '100' }));
    assert.ok(declaredValueError({ amount: '100', currency: 'HBAR', usdEquivalent: '0' }));
    assert.ok(declaredValueError({ amount: '100', currency: 'DOGE' as 'HBAR', usdEquivalent: '100' }));
    assert.equal(
      declaredValueError({ amount: '100', currency: 'HBAR', usdEquivalent: '100' }),
      null,
    );
  });

  test('ratioBasisPoints: fixture ratio ≈ 1.00x', () => {
    const bp = ratioBasisPoints(120000n, 1289176599682n, CHAINLINK_CASSETTE_READING);
    assert.equal(bp, 10000n); // exactly 1.0000x at floored precision
  });
});

describe('ValueAttestationWorker', () => {
  const worker = new ValueAttestationWorker();

  test('GREEN at ratio ~1x on cassette evidence', () => {
    const v = worker.verify(valueClaim());
    assert.equal(v.passed, true);
    assert.equal(v.workerId, 'value-attestation');
    assert.ok(v.findings.some(f => f.includes('inside the 0.5x-2x band')));
    assert.ok(v.findings.some(f => f.includes('0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a')));
    assert.ok(v.findings.some(f => f.includes('18446744073709595481')));
  });

  test('RED at 100x declared value', () => {
    const claim = valueClaim();
    claim.declaredValue = { ...claim.declaredValue!, usdEquivalent: '12000000' };
    const v = worker.verify(claim);
    assert.equal(v.passed, false);
    assert.ok(v.findings.some(f => f.includes('value_band')));
  });

  test('fail closed: declaredValue present but oracleEvidence missing', () => {
    const claim = fixtureValueClaim(); // declaredValue, no evidence
    const v = worker.verify(claim);
    assert.equal(v.passed, false);
    assert.ok(v.findings.some(f => f.includes('evidence_present')));
  });

  test('fail closed: worker runs with no declaredValue (wiring bug guard)', () => {
    const claim = fixtureValueClaim();
    delete claim.declaredValue;
    const v = worker.verify(claim);
    assert.equal(v.passed, false);
  });

  test('fail closed: wrong feed address', () => {
    const claim = claimWithEvidence({
      readings: [readingWith({ feedAddress: '0x0000000000000000000000000000000000000001' })],
    });
    const v = worker.verify(claim);
    assert.equal(v.passed, false);
    assert.ok(v.findings.some(f => f.includes('feed_registry')));
  });

  test('fail closed: tampered answer breaks composite recompute', () => {
    const claim = claimWithEvidence({
      readings: [readingWith({ answer: '9999999' })],
    });
    const v = worker.verify(claim);
    assert.equal(v.passed, false);
  });

  test('fail closed: non-positive round id', () => {
    const claim = claimWithEvidence({
      readings: [readingWith({ roundId: '0' })],
    });
    const v = worker.verify(claim);
    assert.equal(v.passed, false);
  });

  test('fail closed: answeredInRound < roundId (incomplete round)', () => {
    const claim = claimWithEvidence({
      readings: [readingWith({ answeredInRound: '18446744073709595480' })],
    });
    const v = worker.verify(claim);
    assert.equal(v.passed, false);
  });

  test('fail closed: evidence computedAt predates its own round', () => {
    const claim = claimWithEvidence({ computedAt: CHAINLINK_CASSETTE_READING.updatedAt - 60 });
    const v = worker.verify(claim);
    assert.equal(v.passed, false);
    assert.ok(v.findings.some(f => f.includes('evidence_consistency')));
  });

  test('fail closed: reading postdates computedAt beyond skew', () => {
    const claim = claimWithEvidence({
      computedAt: CHAINLINK_CASSETTE_READING.updatedAt - FEED_FUTURE_SKEW_SEC - 60,
    });
    const v = worker.verify(claim);
    assert.equal(v.passed, false);
  });
});

describe('verifyOracleEvidence — two check groups, reject-on-any-fail', () => {
  test('all checks pass on the fixture evidence', () => {
    const r = verifyOracleEvidence(valueClaim());
    assert.equal(r.ok, true);
    assert.equal(r.checks.length, 7);
    assert.ok(r.checks.every(c => c.ok));
  });

  test('Pass A fails independently: unknown feed, Pass B still evaluated', () => {
    const claim = claimWithEvidence({
      readings: [readingWith({ feedAddress: '0xdead000000000000000000000000000000000001' })],
    });
    const r = verifyOracleEvidence(claim);
    assert.equal(r.ok, false);
    const feedCheck = r.checks.find(c => c.name === 'feed_registry');
    const shapeCheck = r.checks.find(c => c.name === 'declared_value_shape');
    assert.equal(feedCheck?.ok, false);
    assert.equal(shapeCheck?.ok, true); // Pass B still evaluated — groups independent
  });

  test('Pass B fails independently: malformed declaredValue, Pass A intact', () => {
    const claim = valueClaim();
    claim.declaredValue = { ...claim.declaredValue!, amount: '-5' };
    const r = verifyOracleEvidence(claim);
    assert.equal(r.ok, false);
    assert.equal(r.checks.find(c => c.name === 'feed_registry')?.ok, true);
    assert.equal(r.checks.find(c => c.name === 'declared_value_shape')?.ok, false);
  });

  test('composite recompute catches edited committed composite', () => {
    const claim = claimWithEvidence({ compositeUsdCents: '999999' });
    const r = verifyOracleEvidence(claim);
    assert.equal(r.ok, false);
    assert.equal(r.checks.find(c => c.name === 'composite_recompute')?.ok, false);
  });

  test('ETH and BTC currencies resolve to their pinned feeds', () => {
    assert.equal(CHAINLINK_FEEDS_TESTNET.ETH.address, '0xb9d461e0b962aF219866aDfA7DD19C52bB9871b9');
    assert.equal(CHAINLINK_FEEDS_TESTNET.BTC.address, '0x058fE79CB5775d4b167920Ca6036B824805A9ABd');
  });
});
