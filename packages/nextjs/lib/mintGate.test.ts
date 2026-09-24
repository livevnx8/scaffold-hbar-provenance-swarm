/**
 * S4: the registry is the one-anchor enforcement point. The certificate NFT
 * may only mint after the registry anchor succeeded — a reverted/duplicate
 * registry write must not mint a second serial, and a registry RPC failure
 * must not leave an NFT with no registry row.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mintSkipReason } from './mintGate.js';

describe('mintSkipReason (S4 mint sequencing)', () => {
  test('verified + registry anchored -> mint', () => {
    assert.equal(mintSkipReason('verified', true), null);
  });

  test('verified + registry duplicate/reverted -> skip, no second serial', () => {
    assert.equal(mintSkipReason('verified', false), 'registry-anchor-failed');
  });

  test('verified + registry RPC failure -> skip, no orphan NFT', () => {
    assert.equal(mintSkipReason('verified', false), 'registry-anchor-failed');
  });

  test('needs_review never mints even when the registry anchor succeeded', () => {
    assert.equal(mintSkipReason('needs_review', true), 'verdict-not-verified');
  });

  test('rejected never mints', () => {
    assert.equal(mintSkipReason('rejected', true), 'verdict-not-verified');
  });
});
