/**
 * Unit test for the /api/anchor registry guard (adversarial finding F6).
 * Without a registry, one-anchor-per-claim is unenforceable, so the anchor
 * route must fail closed before any HCS/NFT write.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registryGuard } from './registryGuard.js';

const KEY = 'HEDERA_REGISTRY_ADDRESS';
let saved: string | undefined;

beforeEach(() => {
  saved = process.env[KEY];
});

afterEach(() => {
  if (saved === undefined) delete process.env[KEY];
  else process.env[KEY] = saved;
});

describe('registryGuard (F6 fail-closed)', () => {
  it('fails closed when HEDERA_REGISTRY_ADDRESS is unset', () => {
    delete process.env[KEY];
    const g = registryGuard();
    assert.equal(g.ok, false);
    if (!g.ok) assert.match(g.error, /HEDERA_REGISTRY_ADDRESS is not configured/);
  });

  it('fails closed when HEDERA_REGISTRY_ADDRESS is blank', () => {
    process.env[KEY] = '   ';
    const g = registryGuard();
    assert.equal(g.ok, false);
  });

  it('passes through a configured registry address', () => {
    process.env[KEY] = '0.0.10649229';
    const g = registryGuard();
    assert.equal(g.ok, true);
    if (g.ok) assert.equal(g.address, '0.0.10649229');
  });
});
