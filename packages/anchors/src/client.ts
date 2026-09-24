/**
 * Browser-safe entry point: types, explorer-URL builders, and ledger metadata.
 * Zero SDK imports — safe to bundle into the Next.js client.
 */
export type {
  AnchorLedger,
  AnchorRequest,
  AnchorResult,
  LedgerAnchor,
} from './types.js';
export { AnchorNotPortedError, assertValidAnchorRequest } from './types.js';
export { buildExplorerUrl, validateAnchorId } from './explorer.js';
export { LEDGERS, LEDGER_META } from './ledgers.js';
export type { LedgerMeta } from './ledgers.js';
