import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { anchorAuth } from './anchorAuth.js';

describe('anchorAuth (optional ANCHOR_API_TOKEN guard)', () => {
  it('is open when no token is configured', () => {
    assert.deepEqual(anchorAuth(null, undefined), { ok: true, open: true });
    assert.deepEqual(anchorAuth(null, '   '), { ok: true, open: true });
  });

  it('accepts the configured bearer token', () => {
    assert.deepEqual(anchorAuth('Bearer s3cret', 's3cret'), { ok: true, open: false });
    assert.deepEqual(anchorAuth('bearer  s3cret ', 's3cret'), { ok: true, open: false });
  });

  it('rejects a missing, malformed or wrong token with 401', () => {
    for (const h of [null, '', 's3cret', 'Basic s3cret', 'Bearer', 'Bearer wrong', 'Bearer s3cret2']) {
      const res = anchorAuth(h, 's3cret');
      assert.equal(res.ok, false, String(h));
      if (!res.ok) assert.equal(res.status, 401);
    }
  });
});
