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
    const res = await oracleGate(fixtureValueClaimWithEvidence(), recorded);
    assert.equal(res.ok, true);
  });

  it('forged round: the forge gate accepts it, the oracle gate returns 403', async () => {
    const forged = fixtureForgedValueClaim();
    const { receipt } = createClient().verifyClaim(forged);
    assert.deepEqual(gateReceipt(receipt, forged), { ok: true });
    const res = await oracleGate(forged, recorded);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.status, 403);
      assert.equal(res.recheck.failure, 'mismatch');
    }
  });

  it('returns 502 when the feed cannot be re-read', async () => {
    const res = await oracleGate(fixtureValueClaimWithEvidence(), unreachable);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 502);
  });

  it('lets plain claims through without reading the feed', async () => {
    const res = await oracleGate(fixtureClaim(), unreachable);
    assert.equal(res.ok, true);
  });
});
