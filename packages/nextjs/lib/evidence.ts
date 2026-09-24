import {
  buildExplorerUrl,
  type AnchorResult,
} from '@provenance-swarm/anchors/client';
import type { AnchorResults } from './types';

/**
 * Map a successful HCS stage into the ledger-neutral anchor shape.
 * Pure function (kept out of the component so it is unit-testable).
 * buildExplorerUrl refuses unknown networks and malformed ids: no row is
 * better than a wrong link, so a refused build simply yields no entry.
 */
export function toAnchorResults(data: AnchorResults, fallbackNetwork: string): AnchorResult[] {
  const out: AnchorResult[] = [];
  const network = data.hcs.network ?? fallbackNetwork;
  if (data.hcs.ok && data.hcs.transactionId) {
    try {
      out.push({
        ledger: 'hedera-hcs',
        network,
        anchorId: data.hcs.transactionId,
        explorerUrl: buildExplorerUrl('hedera-hcs', network, data.hcs.transactionId),
      });
    } catch {
      // Refused: skip the row.
    }
  }
  return out;
}
