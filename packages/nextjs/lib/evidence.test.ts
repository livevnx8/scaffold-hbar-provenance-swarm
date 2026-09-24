/**
 * Unit test for the ledger-neutral evidence mapping (toAnchorResults).
 * The component stays thin; the mapping is where link correctness lives.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toAnchorResults } from './evidence.js';
import type { AnchorResults } from './types.js';

const base: AnchorResults = {
  hcs: { ok: false },
  contract: { ok: false },
  nft: { ok: false },
};

describe('toAnchorResults', () => {
  it('lifts a successful HCS stage into a ledger-neutral anchor', () => {
    const data: AnchorResults = {
      ...base,
      hcs: {
        ok: true,
        network: 'testnet',
        transactionId: '0.0.9034044@1790020468.872095860',
      },
    };
    const out = toAnchorResults(data, 'testnet');
    assert.equal(out.length, 1);
    assert.deepEqual(out[0], {
      ledger: 'hedera-hcs',
      network: 'testnet',
      anchorId: '0.0.9034044@1790020468.872095860',
      explorerUrl:
        'https://hashscan.io/testnet/transaction/0.0.9034044@1790020468.872095860',
    });
  });

  it('falls back to the configured network when the stage omits it', () => {
    const data: AnchorResults = {
      ...base,
      hcs: { ok: true, transactionId: '0.0.1@123.456' },
    };
    const out = toAnchorResults(data, 'mainnet');
    assert.equal(out[0]?.network, 'mainnet');
    assert.match(out[0]?.explorerUrl ?? '', /^https:\/\/hashscan\.io\/mainnet\//);
  });

  it('emits nothing when the HCS stage failed', () => {
    const data: AnchorResults = { ...base, hcs: { ok: false, error: 'boom' } };
    assert.deepEqual(toAnchorResults(data, 'testnet'), []);
  });

  it('emits nothing when the stage is ok but has no transaction id', () => {
    const data: AnchorResults = { ...base, hcs: { ok: true, network: 'testnet' } };
    assert.deepEqual(toAnchorResults(data, 'testnet'), []);
  });

  it('refuses a malformed transaction id instead of linking it', () => {
    const data: AnchorResults = {
      ...base,
      hcs: { ok: true, network: 'testnet', transactionId: 'not-a-tx-id' },
    };
    assert.deepEqual(toAnchorResults(data, 'testnet'), []);
  });

  it('refuses an unknown network instead of guessing a link', () => {
    const data: AnchorResults = {
      ...base,
      hcs: { ok: true, network: 'previewnet', transactionId: '0.0.1@123.456' },
    };
    assert.deepEqual(toAnchorResults(data, 'testnet'), []);
  });
});
