import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registryPrecheck } from './registryPrecheck.js';

/** Shape of the ethers v6 error Hashio returns for getAnchor on an unknown claim (observed on testnet). */
const unknownClaim = Object.assign(new Error('execution reverted: "unknown claim"'), {
  code: 'CALL_EXCEPTION',
  reason: 'unknown claim',
  shortMessage: 'execution reverted: "unknown claim"',
});

describe('registryPrecheck (duplicates refused before any paid write)', () => {
  it('proceeds when the registry reverts with unknown claim', async () => {
    const res = await registryPrecheck({ getAnchor: async () => Promise.reject(unknownClaim) }, 'c1');
    assert.deepEqual(res, { ok: true });
  });

  it('returns 409 when the claim is already anchored', async () => {
    const res = await registryPrecheck(
      { getAnchor: async () => ['0x' + 'ab'.repeat(32), 1790276245n, '0x' + '1'.repeat(40)] },
      'c1',
    );
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.status, 409);
      assert.equal(res.duplicate, true);
    }
  });

  it('fails closed with 502 on any other registry error', async () => {
    const res = await registryPrecheck(
      { getAnchor: async () => Promise.reject(new Error('connect ECONNREFUSED')) },
      'c1',
    );
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 502);
  });

  it('passes the claimId through to the reader', async () => {
    let seen = '';
    await registryPrecheck(
      {
        getAnchor: async (id: string) => {
          seen = id;
          throw unknownClaim;
        },
      },
      'claim-cof-042',
    );
    assert.equal(seen, 'claim-cof-042');
  });
});
