import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { anchorAuth, anchorPolicy } from './anchorAuth.js';

const TOKEN = 'test-token-0123456789abcdef';

describe('anchorAuth (POST /api/anchor fails closed)', () => {
  it('is disabled (503) when ANCHOR_API_TOKEN is unset or blank, even with a header', () => {
    for (const env of [{}, { ANCHOR_API_TOKEN: '' }, { ANCHOR_API_TOKEN: '   ' }]) {
      const res = anchorAuth(`Bearer ${TOKEN}`, env);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.status, 503);
        assert.equal(res.disabled, true);
        assert.match(res.error, /ANCHOR_API_TOKEN is not set/);
      }
    }
  });

  it('is disabled when the token is shorter than 16 characters', () => {
    const res = anchorAuth('Bearer short', { ANCHOR_API_TOKEN: 'short' });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 503);
  });

  it('ANCHOR_API_ENABLED=false disables the route even with a valid token', () => {
    for (const flag of ['false', 'FALSE', '0', 'no', 'off', ' false ']) {
      const res = anchorAuth(`Bearer ${TOKEN}`, { ANCHOR_API_TOKEN: TOKEN, ANCHOR_API_ENABLED: flag });
      assert.equal(res.ok, false, flag);
      if (!res.ok) {
        assert.equal(res.status, 503);
        assert.match(res.error, /ANCHOR_API_ENABLED=false/);
      }
    }
  });

  it('ANCHOR_API_ENABLED=true does not bypass a missing token', () => {
    const res = anchorAuth(`Bearer ${TOKEN}`, { ANCHOR_API_ENABLED: 'true' });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 503);
  });

  it('accepts the configured bearer token', () => {
    assert.deepEqual(anchorAuth(`Bearer ${TOKEN}`, { ANCHOR_API_TOKEN: TOKEN }), { ok: true });
    assert.deepEqual(anchorAuth(`bearer   ${TOKEN} `, { ANCHOR_API_TOKEN: ` ${TOKEN} ` }), { ok: true });
    assert.deepEqual(
      anchorAuth(`Bearer ${TOKEN}`, { ANCHOR_API_TOKEN: TOKEN, ANCHOR_API_ENABLED: 'true' }),
      { ok: true },
    );
  });

  it('rejects a missing, malformed or wrong token with 401', () => {
    for (const h of [null, undefined, '', TOKEN, `Basic ${TOKEN}`, 'Bearer', 'Bearer wrong', `Bearer ${TOKEN}x`, `Bearer ${TOKEN.slice(1)}`]) {
      const res = anchorAuth(h, { ANCHOR_API_TOKEN: TOKEN });
      assert.equal(res.ok, false, String(h));
      if (!res.ok) assert.equal(res.status, 401);
    }
  });

  it('anchorPolicy never exposes a reason for an enabled route and reports why when disabled', () => {
    assert.deepEqual(anchorPolicy({}), { enabled: false, reason: 'token-unset' });
    assert.deepEqual(anchorPolicy({ ANCHOR_API_TOKEN: TOKEN, ANCHOR_API_ENABLED: 'off' }), {
      enabled: false,
      reason: 'disabled-by-flag',
    });
    assert.equal(anchorPolicy({ ANCHOR_API_TOKEN: TOKEN }).enabled, true);
  });
});
