import type { AnchorLedger } from './types.js';

/**
 * Pure explorer-URL builders. No network calls, no credentials — the links are
 * the independently-verifiable half of every AnchorResult. Unknown networks
 * throw instead of guessing a URL (fail-closed: a wrong explorer is worse
 * than no link).
 */
export function buildExplorerUrl(
  ledger: AnchorLedger,
  network: string,
  anchorId: string,
): string {
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
