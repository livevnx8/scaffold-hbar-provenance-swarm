import type { AnchorLedger, LedgerAnchor } from './types.js';
import { createHcsAnchor, type HcsAnchorBackend } from './hedera.js';
import { stubAnchor } from './stubs.js';

export interface AdapterDeps {
  /** Required for 'hedera-hcs': a HederaAnchor-compatible backend (keyed operation). */
  hedera?: HcsAnchorBackend;
  network?: 'testnet' | 'mainnet';
}

/**
 * Resolve the adapter for a ledger. Fail-closed: requesting the HCS adapter
 * without a keyed backend throws instead of returning a half-built adapter.
 */
export function getAdapter(ledger: AnchorLedger, deps: AdapterDeps = {}): LedgerAnchor {
  if (ledger === 'hedera-hcs') {
    if (!deps.hedera) {
      throw new Error('[hedera-hcs] adapter requires a HederaAnchor backend (keyed operation)');
    }
    return createHcsAnchor(deps.hedera, deps.network);
  }
  return stubAnchor(ledger);
}
