import type {
  AnchorLedger,
  AnchorResult,
  LedgerAnchor,
} from './types.js';
import { AnchorNotPortedError } from './types.js';
import { buildExplorerUrl } from './explorer.js';
import { LEDGER_META } from './ledgers.js';

/**
 * Fail-closed stub for an unported ledger. anchor() always throws
 * AnchorNotPortedError — a stub never fabricates a result, so an unported
 * ledger can never show a fake green in the evidence view. The explorer
 * builder still works: it is pure and needed the day the port lands.
 */
export function stubAnchor(ledger: Exclude<AnchorLedger, 'hedera-hcs'>): LedgerAnchor {
  const meta = LEDGER_META[ledger];
  const notPorted = (): Promise<AnchorResult> =>
    Promise.reject(
      new AnchorNotPortedError(
        ledger,
        "awaiting the verified port of Devin's anchor script (re-verification outstanding)",
      ),
    );
  return {
    ledger,
    displayName: meta.displayName,
    ported: false,
    anchor: notPorted,
    explorerUrl: (network, anchorId) => buildExplorerUrl(ledger, network, anchorId),
  };
}

/** Type-level guard: only the three unported ledgers may use the stub. */
export const STUB_LEDGERS: Exclude<AnchorLedger, 'hedera-hcs'>[] = [
  'xrpl',
  'solana',
  'base',
];
