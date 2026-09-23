import type { AnchorLedger } from './types.js';

export interface LedgerMeta {
  ledger: AnchorLedger;
  displayName: string;
  /** True only when the ledger's anchor script is ported AND re-verified. */
  ported: boolean;
  /** Networks the explorer builder accepts for this ledger. */
  networks: string[];
  /** Human name of the explorer, used for link labels. */
  explorerName: string;
  /** Honest one-line status for the evidence view. */
  statusNote: string;
}

/** Canonical ledger order for the evidence view. */
export const LEDGERS: AnchorLedger[] = ['hedera-hcs', 'xrpl', 'solana', 'base'];

export const LEDGER_META: Record<AnchorLedger, LedgerMeta> = {
  'hedera-hcs': {
    ledger: 'hedera-hcs',
    displayName: 'Hedera HCS',
    ported: true,
    networks: ['testnet', 'mainnet'],
    explorerName: 'HashScan',
    statusNote:
      "Ported: wraps the template's HederaAnchor — the receipt hashes go out as a topic message.",
  },
  xrpl: {
    ledger: 'xrpl',
    displayName: 'XRPL',
    ported: false,
    networks: ['testnet', 'devnet', 'mainnet'],
    explorerName: 'XRPL Explorer',
    statusNote:
      "Pending port: awaiting the verified port of Devin's XRPL anchor script (re-verification outstanding).",
  },
  solana: {
    ledger: 'solana',
    displayName: 'Solana',
    ported: false,
    networks: ['devnet', 'mainnet-beta'],
    explorerName: 'Solscan',
    statusNote:
      "Pending port: awaiting the verified port of Devin's Solana anchor script (re-verification outstanding).",
  },
  base: {
    ledger: 'base',
    displayName: 'Base',
    ported: false,
    networks: ['sepolia', 'mainnet'],
    explorerName: 'BaseScan',
    statusNote:
      "Pending port: awaiting the verified port of Devin's Base anchor script (re-verification outstanding).",
  },
};
