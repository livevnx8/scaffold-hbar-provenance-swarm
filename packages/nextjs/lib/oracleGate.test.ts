/**
 * oracleGate status mapping. Offline: the recorded getRoundData response
 * stands in for the chain.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureClaim } from '@provenance-swarm/swarm';
import {
  fixtureValueClaimWithEvidence,
  fixtureForgedValueClaim,
  RecordedPriceFeed,
  CHAINLINK_RECORDED_GET_ROUND,
} from '@provenance-swarm/oracle';
import { oracleGate } from './oracleGate.js';
import { gateReceipt } from './anchorGate.js';
import { createClient } from './client.js';

// Anchor-time clock one minute after the recorded round was published.
const NOW = CHAINLINK_RECORDED_GET_ROUND.updatedAt + 60;
const recorded = () => new RecordedPriceFeed([CHAINLINK_RECORDED_GET_ROUND]);
const unreachable = () => ({
  getRound: async () => {
    throw new Error('HTTP 503');
  },
  getLatestRound: async () => {
    throw new Error('HTTP 503');
  },
});

describe('oracleGate (anchor-time Chainlink re-read)', () => {
  it('passes honest cassette evidence', async () => {
    const res = await oracleGate(fixtureValueClaimWithEvidence(), recorded, { nowSec: NOW });
    assert.equal(res.ok, true);
  });

  it('refuses a real round that is too old at anchor time (403, no replay)', async () => {
    const res = await oracleGate(fixtureValueClaimWithEvidence(), recorded, {
      nowSec: CHAINLINK_RECORDED_GET_ROUND.updatedAt + 86_400 + 1,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.status, 403);
      assert.match(res.error, /older than 86400s/);
      assert.equal(res.recheck.ok, true);
    }
  });

  it('refuses evidence whose answer differs from the chain by a single unit', async () => {
    const claim = fixtureValueClaimWithEvidence();
    const r = claim.oracleEvidence!.readings[0];
    claim.oracleEvidence!.readings[0] = { ...r, answer: String(BigInt(r.answer) + 1n) };
    const res = await oracleGate(claim, recorded, { nowSec: NOW });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.status, 403);
      assert.equal(res.recheck.failure, 'mismatch');
    }
  });

  it('forged round: the forge gate accepts it, the oracle gate returns 403', async () => {
    const forged = fixtureForgedValueClaim();
    const { receipt } = createClient().verifyClaim(forged);
    assert.deepEqual(gateReceipt(receipt, forged), { ok: true });
    const res = await oracleGate(forged, recorded, { nowSec: NOW });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.status, 403);
      assert.equal(res.recheck.failure, 'mismatch');
    }
  });

  it('returns 502 when the feed cannot be re-read', async () => {
    const res = await oracleGate(fixtureValueClaimWithEvidence(), unreachable, { nowSec: NOW });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 502);
  });

  it('lets plain claims through without reading the feed', async () => {
    const res = await oracleGate(fixtureClaim(), unreachable);
    assert.equal(res.ok, true);
  });
});
