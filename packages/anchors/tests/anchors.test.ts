/**
 * Conformance tests for the multi-ledger anchor interface.
 *
 * What is pinned here:
 *  1. Exactly one ledger is ported (hedera-hcs); the other three are stubs.
 *  2. Stubs are fail-closed: anchor() rejects with AnchorNotPortedError and
 *     never fabricates a result.
 *  3. Explorer-URL builders produce exact, independently-checkable links, and
 *     refuse to guess on unknown networks.
 *  4. The HCS adapter delegates to the backend and returns a well-formed
 *     AnchorResult (backend is faked — no network, per the house rule that
 *     unit tests never touch a ledger).
 *  5. The template's HederaAnchor satisfies the adapter's backend surface
 *     (compile-time check).
 */
import type { HederaAnchor } from '@provenance-swarm/swarm';
import {
  AnchorNotPortedError,
  LEDGERS,
  LEDGER_META,
  buildExplorerUrl,
  createHcsAnchor,
  getAdapter,
  stubAnchor,
  STUB_LEDGERS,
} from '../src/index.js';
import type {
  AnchorRequest,
  HcsAnchorBackend,
  LedgerAnchor,
} from '../src/index.js';

// Compile-time: the template's HederaAnchor satisfies the HCS adapter's
// backend surface. If HederaAnchor drifts, tsc fails here, not at runtime.
function _assertBackendCompatible(a: HederaAnchor): HcsAnchorBackend {
  return a;
}

const REQUEST: AnchorRequest = {
  claimId: 'claim-test-001',
  receiptVersion: '1.1',
  taskHash: 't'.repeat(64),
  decisionHash: 'd'.repeat(64),
  verdict: 'verified',
  anchoredAt: '2026-09-23T10:30:00.000Z',
};

describe('ledger registry', () => {
  test('exactly four ledgers in canonical order', () => {
    expect(LEDGERS).toEqual(['hedera-hcs', 'xrpl', 'solana', 'base']);
  });

  test('only hedera-hcs is ported', () => {
    const ported = LEDGERS.filter((l) => LEDGER_META[l].ported);
    expect(ported).toEqual(['hedera-hcs']);
  });

  test('stub ledgers are exactly the unported three', () => {
    expect([...STUB_LEDGERS].sort()).toEqual(['base', 'solana', 'xrpl']);
  });

  test('every ledger declares the networks its explorer builder accepts', () => {
    for (const ledger of LEDGERS) {
      expect(LEDGER_META[ledger].networks.length).toBeGreaterThan(0);
      expect(LEDGER_META[ledger].explorerName.length).toBeGreaterThan(0);
    }
  });
});

describe('fail-closed stubs', () => {
  for (const ledger of STUB_LEDGERS) {
    test(`${ledger}: adapter reports ported=false`, () => {
      const adapter: LedgerAnchor = getAdapter(ledger);
      expect(adapter.ledger).toBe(ledger);
      expect(adapter.ported).toBe(false);
      expect(adapter.displayName).toBe(LEDGER_META[ledger].displayName);
    });

    test(`${ledger}: anchor() rejects with AnchorNotPortedError, never a result`, async () => {
      const adapter = stubAnchor(ledger);
      await expect(adapter.anchor(REQUEST)).rejects.toThrow(AnchorNotPortedError);
      try {
        await adapter.anchor(REQUEST);
        throw new Error('stub resolved — fail-closed violated');
      } catch (err) {
        expect(err).toBeInstanceOf(AnchorNotPortedError);
        expect((err as AnchorNotPortedError).ledger).toBe(ledger);
        expect((err as Error).message).toContain(ledger);
      }
    });
  }

  test('getAdapter without a backend throws for hedera-hcs (no half-built adapter)', () => {
    expect(() => getAdapter('hedera-hcs')).toThrow(/requires a HederaAnchor backend/);
  });
});

describe('explorer URLs', () => {
  test('hedera-hcs testnet transaction', () => {
    expect(buildExplorerUrl('hedera-hcs', 'testnet', '0.0.1@123.456')).toBe(
      'https://hashscan.io/testnet/transaction/0.0.1@123.456',
    );
  });

  test('hedera-hcs mainnet transaction', () => {
    expect(buildExplorerUrl('hedera-hcs', 'mainnet', '0.0.1@123.456')).toBe(
      'https://hashscan.io/mainnet/transaction/0.0.1@123.456',
    );
  });

  test('xrpl testnet transaction', () => {
    expect(buildExplorerUrl('xrpl', 'testnet', 'ABCDEF123')).toBe(
      'https://testnet.xrpl.org/transactions/ABCDEF123',
    );
  });

  test('xrpl devnet and mainnet hosts', () => {
    expect(buildExplorerUrl('xrpl', 'devnet', 'ABC')).toBe(
      'https://devnet.xrpl.org/transactions/ABC',
    );
    expect(buildExplorerUrl('xrpl', 'mainnet', 'ABC')).toBe(
      'https://livenet.xrpl.org/transactions/ABC',
    );
  });

  test('solana devnet signature carries the cluster param', () => {
    expect(buildExplorerUrl('solana', 'devnet', 'SIG123')).toBe(
      'https://solscan.io/tx/SIG123?cluster=devnet',
    );
  });

  test('solana mainnet-beta signature has no cluster param', () => {
    expect(buildExplorerUrl('solana', 'mainnet-beta', 'SIG123')).toBe(
      'https://solscan.io/tx/SIG123',
    );
  });

  test('base sepolia and mainnet transactions', () => {
    expect(buildExplorerUrl('base', 'sepolia', '0xabc')).toBe(
      'https://sepolia.basescan.org/tx/0xabc',
    );
    expect(buildExplorerUrl('base', 'mainnet', '0xabc')).toBe('https://basescan.org/tx/0xabc');
  });

  test('unknown network throws instead of guessing a URL', () => {
    expect(() => buildExplorerUrl('hedera-hcs', 'previewnet', 'x')).toThrow(
      /refusing to guess an explorer URL/,
    );
    expect(() => buildExplorerUrl('xrpl', 'mainnet2', 'x')).toThrow(
      /refusing to guess an explorer URL/,
    );
    expect(() => buildExplorerUrl('solana', 'testnet', 'x')).toThrow(
      /refusing to guess an explorer URL/,
    );
    expect(() => buildExplorerUrl('base', 'goerli', 'x')).toThrow(
      /refusing to guess an explorer URL/,
    );
  });

  test('stub adapters expose the same pure explorer builder', () => {
    expect(stubAnchor('xrpl').explorerUrl('testnet', 'ABC')).toBe(
      'https://testnet.xrpl.org/transactions/ABC',
    );
  });
});

describe('HCS adapter (ported reference)', () => {
  const fakeBackend: HcsAnchorBackend = {
    anchorReceipt: async (receipt) => {
      expect(receipt.claimId).toBe(REQUEST.claimId);
      expect(receipt.decisionHash).toBe(REQUEST.decisionHash);
      expect(receipt.taskHash).toBe(REQUEST.taskHash);
      return {
        topicId: '0.0.99999',
        sequenceNumber: '7',
        transactionId: '0.0.1@123.456',
      };
    },
  };

  test('reports ported=true and delegates to the backend', async () => {
    const adapter = createHcsAnchor(fakeBackend, 'testnet');
    expect(adapter.ledger).toBe('hedera-hcs');
    expect(adapter.ported).toBe(true);
    const result = await adapter.anchor(REQUEST);
    expect(result).toEqual({
      ledger: 'hedera-hcs',
      network: 'testnet',
      anchorId: '0.0.1@123.456',
      explorerUrl: 'https://hashscan.io/testnet/transaction/0.0.1@123.456',
    });
  });

  test('network passes through to the result and the explorer URL', async () => {
    const adapter = createHcsAnchor(fakeBackend, 'mainnet');
    const result = await adapter.anchor(REQUEST);
    expect(result.network).toBe('mainnet');
    expect(result.explorerUrl).toBe('https://hashscan.io/mainnet/transaction/0.0.1@123.456');
  });

  test('explorerUrl is pure (no backend call)', () => {
    let calls = 0;
    const counting: HcsAnchorBackend = {
      anchorReceipt: async () => {
        calls += 1;
        return { topicId: '0.0.1', sequenceNumber: '1', transactionId: '0.0.1@1.1' };
      },
    };
    const adapter = createHcsAnchor(counting);
    expect(adapter.explorerUrl('testnet', '0.0.1@123.456')).toBe(
      'https://hashscan.io/testnet/transaction/0.0.1@123.456',
    );
    expect(calls).toBe(0);
  });

  test('getAdapter wires the HCS backend through', async () => {
    const adapter = getAdapter('hedera-hcs', { hedera: fakeBackend, network: 'testnet' });
    expect(adapter.ported).toBe(true);
    const result = await adapter.anchor(REQUEST);
    expect(result.ledger).toBe('hedera-hcs');
  });
});
