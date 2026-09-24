/**
 * @provenance-swarm/anchors — multi-ledger anchor interface (Phase 3 scaffolding)
 *
 * One common contract every ledger anchor implements. Hedera HCS is the ported
 * reference implementation (it wraps the template's existing HederaAnchor).
 * XRPL, Solana, and Base ship as fail-closed stubs until Devin's anchor scripts
 * are ported AND re-verified on a stranger machine. A stub never fabricates a
 * result: anchor() throws AnchorNotPortedError.
 */

export type AnchorLedger = 'hedera-hcs' | 'xrpl' | 'solana' | 'base';

/** Ledger-neutral anchor request: the receipt fields every ledger commits to. */
export interface AnchorRequest {
  claimId: string;
  /** Receipt hash-construction version ('1.0' | '1.1'). */
  receiptVersion: string;
  taskHash: string;
  decisionHash: string;
  verdict: string;
  /** ISO-8601 timestamp of the receipt. */
  anchoredAt: string;
}

/**
 * Ledger-neutral anchor result. Every field is independently re-checkable:
 * paste anchorId into explorerUrl and verify without trusting this package.
 */
export interface AnchorResult {
  ledger: AnchorLedger;
  /** Ledger network the anchor landed on (e.g. 'testnet', 'devnet', 'sepolia'). */
  network: string;
  /**
   * Ledger-native proof pointer: transaction id / signature / topic sequence.
   * This is the value the explorer link resolves.
   */
  anchorId: string;
  /** Independently verifiable scan link for anchorId. */
  explorerUrl: string;
}

/** Thrown by every unported ledger adapter. Fail-closed by construction. */
export class AnchorNotPortedError extends Error {
  readonly ledger: AnchorLedger;
  constructor(ledger: AnchorLedger, detail?: string) {
    super(`[${ledger}] anchor not ported${detail ? `: ${detail}` : ''}`);
    this.name = 'AnchorNotPortedError';
    this.ledger = ledger;
  }
}

/**
 * Fail-closed request validation. Every ported adapter must run this before
 * touching its backend (keyed or not): a malformed request is a caller bug,
 * and caller bugs must surface as clear errors, never as anchors of garbage.
 * Throws on the first invalid field.
 */
export function assertValidAnchorRequest(request: AnchorRequest): void {
  const fail = (field: string, why: string): never => {
    throw new Error(`[anchor-request] invalid ${field}: ${why}`);
  };
  if (typeof request.claimId !== 'string' || request.claimId.trim().length === 0) {
    fail('claimId', 'must be a non-empty string');
  }
  if (request.claimId.length > 256) {
    fail('claimId', 'must be at most 256 characters');
  }
  if (request.receiptVersion !== '1.0' && request.receiptVersion !== '1.1') {
    fail('receiptVersion', "must be a known receipt version ('1.0' | '1.1')");
  }
  if (typeof request.taskHash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(request.taskHash)) {
    fail('taskHash', 'must be a 64-char hex sha256 digest');
  }
  if (typeof request.decisionHash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(request.decisionHash)) {
    fail('decisionHash', 'must be a 64-char hex sha256 digest');
  }
  if (typeof request.verdict !== 'string' || request.verdict.trim().length === 0) {
    fail('verdict', 'must be a non-empty string');
  }
  if (typeof request.anchoredAt !== 'string' || Number.isNaN(Date.parse(request.anchoredAt))) {
    fail('anchoredAt', 'must be a parseable ISO-8601 timestamp');
  }
}

/**
 * The contract a ledger anchor implements.
 *
 * `ported` is true only when the ledger's anchor script is ported AND its
 * results re-verified on a stranger machine. When false, anchor() MUST throw
 * AnchorNotPortedError and never return a fabricated result.
 */
export interface LedgerAnchor {
  readonly ledger: AnchorLedger;
  readonly displayName: string;
  readonly ported: boolean;
  anchor(request: AnchorRequest): Promise<AnchorResult>;
  /** Pure function: build the scan link for an anchor id. No network. */
  explorerUrl(network: string, anchorId: string): string;
}
