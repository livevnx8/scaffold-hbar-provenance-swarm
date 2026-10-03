/**
 * Anchor-time on-chain re-check of committed oracle evidence.
 *
 * Every port here is a RecordedPriceFeed or a fake, so no network is touched.
 * CHAINLINK_RECORDED_GET_ROUND is a real getRoundData response recorded from
 * the testnet HBAR/USD proxy.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureClaim } from '@provenance-swarm/swarm';
import type { FeedReading } from '@provenance-swarm/swarm';
import {
  createClient,
  fixtureValueClaimWithEvidence,
  fixtureForgedValueClaim,
  recheckOracleEvidenceOnChain,
  RecordedPriceFeed,
  CHAINLINK_RECORDED_GET_ROUND,
  CHAINLINK_CASSETTE_READING,
} from '../src/index.js';
import type { PriceFeedPort } from '../src/reader.js';

const recorded = () => new RecordedPriceFeed([CHAINLINK_RECORDED_GET_ROUND]);

describe('recheckOracleEvidenceOnChain', () => {
  test('recorded getRoundData equals the cassette round field for field', () => {
    for (const f of ['roundId', 'answer', 'updatedAt', 'decimals', 'answeredInRound', 'feedAddress', 'pair'] as const) {
      assert.equal(String(CHAINLINK_RECORDED_GET_ROUND[f]), String(CHAINLINK_CASSETTE_READING[f]));
    }
  });

  test('honest cassette evidence matches the chain', async () => {
    const res = await recheckOracleEvidenceOnChain(fixtureValueClaimWithEvidence(), recorded);
    assert.equal(res.ok, true);
    assert.equal(res.checks.length, 1);
    assert.deepEqual(res.checks[0].mismatches, []);
  });

  test('forged answer passes the sync worker but fails the on-chain re-check', async () => {
    const forged = fixtureForgedValueClaim();
    assert.equal(createClient().verifyClaim(forged).receipt.verdict, 'verified');
    const res = await recheckOracleEvidenceOnChain(forged, recorded);
    assert.equal(res.ok, false);
    assert.equal(res.failure, 'mismatch');
    assert.match(res.checks[0].mismatches.join(';'), /^answer: committed 930826700, chain 9308267$/);
  });

  test('a forged updatedAt is a mismatch too', async () => {
    const c = fixtureValueClaimWithEvidence();
    const r = { ...c.oracleEvidence.readings[0], updatedAt: c.oracleEvidence.readings[0].updatedAt + 1 };
    const res = await recheckOracleEvidenceOnChain(
      { ...c, oracleEvidence: { ...c.oracleEvidence, readings: [r] } },
      recorded,
    );
    assert.equal(res.failure, 'mismatch');
  });

  test('a feed address outside the pinned registry is refused without reading', async () => {
    let reads = 0;
    const port = (): PriceFeedPort => ({
      getRound: async () => {
        reads++;
        return CHAINLINK_RECORDED_GET_ROUND;
      },
      getLatestRound: async () => CHAINLINK_RECORDED_GET_ROUND,
    });
    const c = fixtureValueClaimWithEvidence();
    const r: FeedReading = { ...c.oracleEvidence.readings[0], feedAddress: '0x' + '1'.repeat(40) };
    const res = await recheckOracleEvidenceOnChain(
      { ...c, oracleEvidence: { ...c.oracleEvidence, readings: [r] } },
      port,
    );
    assert.equal(res.failure, 'unknown-feed');
    assert.equal(reads, 0);
  });

  test('an unrecorded round (feed cannot serve it) is feed-unreachable, not ok', async () => {
    const c = fixtureValueClaimWithEvidence();
    const r = { ...c.oracleEvidence.readings[0], roundId: '18446744073709595482', answeredInRound: '18446744073709595482' };
    const res = await recheckOracleEvidenceOnChain(
      { ...c, oracleEvidence: { ...c.oracleEvidence, readings: [r] } },
      recorded,
    );
    assert.equal(res.ok, false);
    assert.equal(res.failure, 'feed-unreachable');
  });

  test('a non-numeric roundId is a mismatch', async () => {
    const c = fixtureValueClaimWithEvidence();
    const r = { ...c.oracleEvidence.readings[0], roundId: '1e3' };
    const res = await recheckOracleEvidenceOnChain(
      { ...c, oracleEvidence: { ...c.oracleEvidence, readings: [r] } },
      recorded,
    );
    assert.equal(res.failure, 'mismatch');
  });

  test('declaredValue without evidence fails closed', async () => {
    const c = fixtureValueClaimWithEvidence();
    const { oracleEvidence: _drop, ...noEvidence } = c;
    void _drop;
    const res = await recheckOracleEvidenceOnChain(noEvidence, recorded);
    assert.equal(res.failure, 'no-evidence');
  });

  test('a plain claim with no value has nothing to re-check', async () => {
    const res = await recheckOracleEvidenceOnChain(fixtureClaim(), recorded);
    assert.deepEqual(res, { ok: true, checks: [] });
  });
});
