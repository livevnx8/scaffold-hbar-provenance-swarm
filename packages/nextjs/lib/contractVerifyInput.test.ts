/**
 * /api/contract-verify input validation: claimId and decisionHash feed
 * string-only operations (startsWith/toLowerCase) and the ethers call. A
 * non-string truthy value (number, array, object) must fail closed at 400,
 * not throw a TypeError mid-route and 500 with the engine message.
 *
 * The route module is imported directly and POST is invoked with synthetic
 * Requests (no Next.js server needed). HEDERA_REGISTRY_ADDRESS is pointed at
 * a dummy so the input-validation path is reached before any RPC attempt.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/contract-verify/route.js';

process.env.HEDERA_REGISTRY_ADDRESS = '0x0000000000000000000000000000000000000001';

function req(body: unknown): Request {
  return new Request('http://localhost/api/contract-verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('contract-verify input validation', () => {
  test('numeric decisionHash -> 400, not 500', async () => {
    const res = await POST(req({ claimId: 'x', decisionHash: 12345 }));
    assert.equal(res.status, 400);
    const data = (await res.json()) as { error?: string };
    assert.match(data.error ?? '', /required as strings/);
  });

  test('array claimId -> 400', async () => {
    const res = await POST(req({ claimId: ['x'], decisionHash: 'ab'.repeat(32) }));
    assert.equal(res.status, 400);
  });

  test('object decisionHash -> 400', async () => {
    const res = await POST(req({ claimId: 'x', decisionHash: { h: 'ab' } }));
    assert.equal(res.status, 400);
  });

  test('missing fields -> 400', async () => {
    const res = await POST(req({ claimId: 'x' }));
    assert.equal(res.status, 400);
  });

  test('malformed JSON body -> 400', async () => {
    const bad = new Request('http://localhost/api/contract-verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const res = await POST(bad);
    assert.equal(res.status, 400);
  });
});
