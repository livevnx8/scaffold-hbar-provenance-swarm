import type { AnchorLedger } from './types.js';

/**
 * Anchor-id shapes per ledger. Validation runs inside buildExplorerUrl — the
 * single choke point for every evidence link — so a malformed id can never
 * produce a plausible-looking link to the wrong (or no) transaction.
 */
const ANCHOR_ID_PATTERNS: Record<AnchorLedger, { pattern: RegExp; example: string }> = {
  // shard.realm.num@seconds.nanos, e.g. 0.0.9034044@1790020468.872095860
  'hedera-hcs': { pattern: /^\d+\.\d+\.\d+@\d+\.\d+$/, example: '0.0.123@1234567890.123456789' },
  // 64 hex chars (XRPL transaction hash)
  xrpl: { pattern: /^[0-9A-Fa-f]{64}$/, example: 'A1B2…(64 hex chars)' },
  // base58 signature, 64 bytes encode to ~87-88 chars; bounds kept generous
  // so a valid signature is never rejected, while garbage is.
  solana: { pattern: /^[1-9A-HJ-NP-Za-km-z]{32,88}$/, example: '5Kt…(base58 signature)' },
  // 0x + 64 hex chars (EVM transaction hash)
  base: { pattern: /^0x[0-9a-fA-F]{64}$/, example: '0xabc…(64 hex chars)' },
};

export function validateAnchorId(ledger: AnchorLedger, anchorId: string): void {
  const { pattern, example } = ANCHOR_ID_PATTERNS[ledger];
  if (typeof anchorId !== 'string' || !pattern.test(anchorId)) {
    throw new Error(
      `[${ledger}] malformed anchor id ${JSON.stringify(anchorId)}: ` +
        `expected shape like ${example}; refusing to build an explorer link`,
    );
  }
}

/**
 * Pure explorer-URL builders. No network calls, no credentials — the links are
 * the independently-verifiable half of every AnchorResult. Unknown networks
 * and malformed anchor ids throw instead of guessing (fail-closed: a wrong
 * explorer link is worse than no link).
 */
export function buildExplorerUrl(
  ledger: AnchorLedger,
  network: string,
  anchorId: string,
): string {
  validateAnchorId(ledger, anchorId);
  switch (ledger) {
    case 'hedera-hcs':
      if (network === 'testnet' || network === 'mainnet') {
        return `https://hashscan.io/${network}/transaction/${anchorId}`;
      }
      break;
    case 'xrpl': {
      const host =
        network === 'mainnet'
          ? 'livenet.xrpl.org'
          : network === 'testnet'
            ? 'testnet.xrpl.org'
            : network === 'devnet'
              ? 'devnet.xrpl.org'
              : null;
      if (host) return `https://${host}/transactions/${anchorId}`;
      break;
    }
    case 'solana': {
      if (network === 'mainnet-beta') return `https://solscan.io/tx/${anchorId}`;
      if (network === 'devnet') return `https://solscan.io/tx/${anchorId}?cluster=devnet`;
      break;
    }
    case 'base': {
      if (network === 'mainnet') return `https://basescan.org/tx/${anchorId}`;
      if (network === 'sepolia') return `https://sepolia.basescan.org/tx/${anchorId}`;
      break;
    }
  }
  throw new Error(`[${ledger}] unknown network '${network}': refusing to guess an explorer URL`);
}
