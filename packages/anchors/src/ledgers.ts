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
      'Keyed-run script ported and field-proven (scripts/xrpl-attest.mjs: 8/8 attestations, tesSUCCESS, memo byte-match, two independent rigs 2026-09-23). In-app adapter remains a fail-closed stub per PORTING.md.',
  },
  solana: {
    ledger: 'solana',
    displayName: 'Solana',
    ported: false,
    networks: ['devnet', 'mainnet-beta'],
    explorerName: 'Solscan',
    statusNote:
      'Keyed-run script ported and field-proven (scripts/solana-attest.mjs: 4/4 attestations on devnet 2026-09-23). In-app adapter remains a fail-closed stub per PORTING.md.',
  },
  base: {
    ledger: 'base',
    displayName: 'Base',
    ported: false,
    networks: ['sepolia', 'mainnet'],
    explorerName: 'BaseScan',
    statusNote:
      'Pending: the EVM attester is written but not yet field-tested (Base Sepolia blocked on faucet funding 2026-09-23). It stays out of this repo until it passes a live run.',
  },
};
