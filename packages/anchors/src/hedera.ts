import type { AnchorRequest, AnchorResult, LedgerAnchor } from './types.js';
import { buildExplorerUrl } from './explorer.js';
import { LEDGER_META } from './ledgers.js';

/**
 * Minimal backend surface the HCS adapter needs. The template's HederaAnchor
 * (packages/swarm/src/hedera.ts) satisfies this structurally — production
 * wiring passes a real HederaAnchor; the conformance test pins that with a
 * compile-time check. No @hashgraph/sdk import here: keyed network I/O stays
 * in the swarm package, behind explicit env config.
 */
export interface HcsAnchorBackend {
  anchorReceipt(receipt: {
    claimId: string;
    version: string;
    taskHash: string;
    decisionHash: string;
    verdict: string;
    /** HederaAnchor reads this field opaquely into the HCS message JSON. */
    timestamp: string | number;
  }): Promise<{ topicId: string; sequenceNumber: string; transactionId: string }>;
}

/**
 * Ported reference implementation: Hedera HCS. Extends the existing anchor —
 * the receipt-hash message construction lives in HederaAnchor, this adapter
 * only translates the ledger-neutral request/result shapes.
 */
export function createHcsAnchor(
  backend: HcsAnchorBackend,
  network: 'testnet' | 'mainnet' = 'testnet',
): LedgerAnchor {
  return {
    ledger: 'hedera-hcs',
    displayName: LEDGER_META['hedera-hcs'].displayName,
    ported: true,
    async anchor(request: AnchorRequest): Promise<AnchorResult> {
      const record = await backend.anchorReceipt({
        claimId: request.claimId,
        version: request.receiptVersion,
        taskHash: request.taskHash,
        decisionHash: request.decisionHash,
        verdict: request.verdict,
        timestamp: request.anchoredAt,
      });
      return {
        ledger: 'hedera-hcs',
        network,
        anchorId: record.transactionId,
        explorerUrl: buildExplorerUrl('hedera-hcs', network, record.transactionId),
      };
    },
    explorerUrl: (net, anchorId) => buildExplorerUrl('hedera-hcs', net, anchorId),
  };
}
