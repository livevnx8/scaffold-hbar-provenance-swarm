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
  assertValidAnchorRequest,
  buildExplorerUrl,
  createHcsAnchor,
  getAdapter,
  stubAnchor,
  STUB_LEDGERS,
  validateAnchorId,
} from '../src/index.js';
import type {
  AnchorRequest,
  HcsAnchorBackend,
  LedgerAnchor,
} from '../src/index.js';

// Compile-time: the template's HederaAnchor satisfies the HCS adapter's
// backend surface. If HederaAnchor drifts, tsc fails here, not at runtime.
function assertBackendCompatible(a: HederaAnchor): HcsAnchorBackend {
  return a;
}

test('template HederaAnchor satisfies the HCS backend surface', () => {
  expect(typeof assertBackendCompatible).toBe('function');
});

const REQUEST: AnchorRequest = {
  claimId: 'claim-test-001',
  receiptVersion: '1.1',
  taskHash: 'ef978aaefc2c6529995acbc9e2e1790ce906a7871e8d6bcbc8277272deea44ee',
  decisionHash: 'b7a74d10d5287e9d383d92568b87d9a8eab999374095c4d599338a120f12c2c5',
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

// Realistic fixture ids (valid shapes, not real transactions).
const XRPL_TX = 'AB'.repeat(32);
const SOL_SIG = '5'.repeat(87);
const BASE_TX = `0x${'ab'.repeat(32)}`;

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
    expect(buildExplorerUrl('xrpl', 'testnet', XRPL_TX)).toBe(
      `https://testnet.xrpl.org/transactions/${XRPL_TX}`,
    );
  });

  test('xrpl devnet and mainnet hosts', () => {
    expect(buildExplorerUrl('xrpl', 'devnet', XRPL_TX)).toBe(
      `https://devnet.xrpl.org/transactions/${XRPL_TX}`,
    );
    expect(buildExplorerUrl('xrpl', 'mainnet', XRPL_TX)).toBe(
      `https://livenet.xrpl.org/transactions/${XRPL_TX}`,
    );
  });

  test('solana devnet signature carries the cluster param', () => {
    expect(buildExplorerUrl('solana', 'devnet', SOL_SIG)).toBe(
      `https://solscan.io/tx/${SOL_SIG}?cluster=devnet`,
    );
  });

  test('solana mainnet-beta signature has no cluster param', () => {
    expect(buildExplorerUrl('solana', 'mainnet-beta', SOL_SIG)).toBe(
      `https://solscan.io/tx/${SOL_SIG}`,
    );
  });

  test('base sepolia and mainnet transactions', () => {
    expect(buildExplorerUrl('base', 'sepolia', BASE_TX)).toBe(
      `https://sepolia.basescan.org/tx/${BASE_TX}`,
    );
    expect(buildExplorerUrl('base', 'mainnet', BASE_TX)).toBe(`https://basescan.org/tx/${BASE_TX}`);
  });

  test('unknown network throws instead of guessing a URL', () => {
    expect(() => buildExplorerUrl('hedera-hcs', 'previewnet', '0.0.1@123.456')).toThrow(
      /refusing to guess an explorer URL/,
    );
    expect(() => buildExplorerUrl('xrpl', 'mainnet2', XRPL_TX)).toThrow(
      /refusing to guess an explorer URL/,
    );
    expect(() => buildExplorerUrl('solana', 'testnet', SOL_SIG)).toThrow(
      /refusing to guess an explorer URL/,
    );
    expect(() => buildExplorerUrl('base', 'goerli', BASE_TX)).toThrow(
      /refusing to guess an explorer URL/,
    );
  });

  test('stub adapters expose the same pure explorer builder', () => {
    expect(stubAnchor('xrpl').explorerUrl('testnet', XRPL_TX)).toBe(
      `https://testnet.xrpl.org/transactions/${XRPL_TX}`,
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

describe('anchor-id validation', () => {
  const VALID: Record<string, [string, string]> = {
    'hedera-hcs': ['testnet', '0.0.9034044@1790020468.872095860'],
    xrpl: ['testnet', 'AB'.repeat(32)],
    solana: ['devnet', '5'.repeat(87)],
    base: ['sepolia', `0x${'ab'.repeat(32)}`],
  };

  test('well-formed ids are accepted', () => {
    expect(() =>
      validateAnchorId('hedera-hcs', '0.0.9034044@1790020468.872095860'),
    ).not.toThrow();
    expect(() => validateAnchorId('xrpl', 'A'.repeat(64))).not.toThrow();
    expect(() => validateAnchorId('solana', '5'.repeat(88))).not.toThrow();
    expect(() => validateAnchorId('base', `0x${'ab'.repeat(32)}`)).not.toThrow();
  });

  test('malformed ids throw for every ledger', () => {
    const bad: [string, string][] = [
      ['hedera-hcs', 'not-a-tx-id'],
      ['hedera-hcs', '0.0.123'], // account id, not a transaction id
      ['hedera-hcs', '0.0.123@abc.def'], // non-numeric timestamp
      ['xrpl', 'ABCDEF'], // too short
      ['xrpl', 'G'.repeat(64)], // non-hex char
      ['solana', 'short'], // too short
      ['solana', '0'.repeat(88)], // 0 is not base58
      ['solana', 'O'.repeat(88)], // O is not base58
      ['base', 'ab'.repeat(32)], // missing 0x
      ['base', `0x${'zz'.repeat(32)}`], // non-hex
      ['base', '0x1234'], // too short
    ];
    for (const [ledger, id] of bad) {
      expect(() =>
        validateAnchorId(ledger as 'hedera-hcs', id),
      ).toThrow(/malformed anchor id/);
    }
  });

  test('non-string ids throw', () => {
    expect(() => validateAnchorId('xrpl', undefined as unknown as string)).toThrow(
      /malformed anchor id/,
    );
  });

  test('buildExplorerUrl validates the id before building', () => {
    expect(() => buildExplorerUrl('base', 'sepolia', 'garbage')).toThrow(
      /malformed anchor id/,
    );
    // valid ids still build exact URLs
    for (const [ledger, [network, id]] of Object.entries(VALID)) {
      expect(() => buildExplorerUrl(ledger as 'hedera-hcs', network, id)).not.toThrow();
    }
  });
});

describe('request validation', () => {
  test('the valid fixture passes', () => {
    expect(() => assertValidAnchorRequest(REQUEST)).not.toThrow();
  });

  test('each invalid field throws a named error', () => {
    const cases: [string, AnchorRequest][] = [
      ['claimId', { ...REQUEST, claimId: '' }],
      ['claimId', { ...REQUEST, claimId: '   ' }],
      ['receiptVersion', { ...REQUEST, receiptVersion: '2.0' }],
      ['receiptVersion', { ...REQUEST, receiptVersion: '' }],
      ['taskHash', { ...REQUEST, taskHash: 'xyz' }],
      ['taskHash', { ...REQUEST, taskHash: 'ab'.repeat(31) }],
      ['decisionHash', { ...REQUEST, decisionHash: '0'.repeat(63) }],
      ['verdict', { ...REQUEST, verdict: '' }],
      ['anchoredAt', { ...REQUEST, anchoredAt: 'not-a-date' }],
    ];
    for (const [field, req] of cases) {
      expect(() => assertValidAnchorRequest(req)).toThrow(
        new RegExp(`\\[anchor-request\\] invalid ${field}`),
      );
    }
  });

  test('HCS adapter rejects a malformed request before touching the backend', async () => {
    let calls = 0;
    const counting: HcsAnchorBackend = {
      anchorReceipt: async () => {
        calls += 1;
        return { topicId: '0.0.1', sequenceNumber: '1', transactionId: '0.0.1@1.1' };
      },
    };
    const adapter = createHcsAnchor(counting);
    await expect(adapter.anchor({ ...REQUEST, decisionHash: 'garbage' })).rejects.toThrow(
      /\[anchor-request\] invalid decisionHash/,
    );
    expect(calls).toBe(0);
  });

  test('HCS adapter rejects an unknown receipt version (no silent new-version anchors)', async () => {
    const adapter = createHcsAnchor({
      anchorReceipt: async () => ({
        topicId: '0.0.1',
        sequenceNumber: '1',
        transactionId: '0.0.1@1.1',
      }),
    });
    await expect(adapter.anchor({ ...REQUEST, receiptVersion: '3.0' })).rejects.toThrow(
      /invalid receiptVersion/,
    );
  });
});
