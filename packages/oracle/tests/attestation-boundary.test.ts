/**
 * Attestation boundary tests: attestClaimValue is the ONLY network/wall-clock
 * boundary, and its documented contract is "throws AttestationError on any
 * failure — never returns partial evidence". A hostile or compromised feed
 * port can return shaped-but-insane rounds (negative or gigantic decimals,
 * non-numeric answers) that make the BigInt evidence math throw a raw
 * RangeError/SyntaxError. Those must surface as AttestationError(kind
 * 'feed') so /api/verify maps them to a clean 502, never a raw engine error.
 *
 * All ports are fakes — no network.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureValueClaim } from '@provenance-swarm/swarm';
import type { FeedReading } from '@provenance-swarm/swarm';
import type { PriceFeedPort } from '../src/reader.js';
import { attestClaimValue, AttestationError } from '../src/index.js';

const BASE_READING: FeedReading = {
  pair: 'HBAR/USD',
  feedAddress: '0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a',
  roundId: '18446744073709595665',
  answer: '9675969',
  updatedAt: Math.floor(Date.now() / 1000),
  decimals: 8,
  answeredInRound: '18446744073709595665',
  mode: 'live',
};

function portWith(reading: FeedReading): PriceFeedPort {
  return {
    getLatestRound: async () => ({ ...reading }),
    getRound: async () => ({ ...reading }),
  };
}

async function rejectsAsFeed(overrides: Partial<FeedReading>, label: string) {
  const claim = fixtureValueClaim();
  await assert.rejects(
    attestClaimValue(claim, portWith({ ...BASE_READING, ...overrides })),
    (err: unknown) => {
      assert.ok(err instanceof AttestationError, `${label}: expected AttestationError, got ${String(err)}`);
      assert.equal(
        (err as AttestationError).kind,
        'feed',
        `${label}: expected kind 'feed'`,
      );
      return true;
    },
    label,
  );
}

describe('attestation boundary: hostile readings map to AttestationError(feed)', () => {
  test('gigantic decimals -> feed error, not raw RangeError', async () => {
    await rejectsAsFeed({ decimals: Number.MAX_SAFE_INTEGER }, 'huge decimals');
  });

  test('negative decimals -> feed error, not raw RangeError', async () => {
    await rejectsAsFeed({ decimals: -5 }, 'negative decimals');
  });

  test('non-numeric answer -> feed error, not raw SyntaxError', async () => {
    await rejectsAsFeed({ answer: 'abc' }, 'alpha answer');
  });

  test('fractional answer -> feed error, not raw SyntaxError', async () => {
    await rejectsAsFeed({ answer: '1.5' }, 'fractional answer');
  });

  test('scientific-notation answer -> feed error, not raw SyntaxError', async () => {
    await rejectsAsFeed({ answer: '12e3' }, 'scientific answer');
  });

  test('sane reading still attests and commits fresh evidence', async () => {
    const claim = fixtureValueClaim();
    const enriched = await attestClaimValue(claim, portWith(BASE_READING));
    assert.equal(enriched.oracleEvidence?.readings[0]?.answer, '9675969');
    assert.equal(enriched.oracleEvidence?.readings[0]?.pair, 'HBAR/USD');
    // Input claim is not mutated.
    assert.equal(claim.oracleEvidence, undefined);
  });

  test('malformed declaredValue still maps to client error', async () => {
    const claim = { ...fixtureValueClaim(), declaredValue: { amount: '0', currency: 'HBAR', usdEquivalent: '1' } } as never;
    await assert.rejects(
      attestClaimValue(claim, portWith(BASE_READING)),
      (err: unknown) => {
        assert.ok(err instanceof AttestationError);
        assert.equal((err as AttestationError).kind, 'client');
        return true;
      },
    );
  });
});
