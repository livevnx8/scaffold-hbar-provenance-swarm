/**
 * Provenance Swarm Template — Chainlink feed registry + value constants
 *
 * Pure constants for the value-attestation worker and its verifier. This
 * module is deliberately dependency-free and I/O-free: the deterministic
 * core (worker, verifier, client) imports from here, never from the network
 * boundary module (reader.ts), so no I/O capability can leak into the pure
 * core through a constants import.
 *
 * Feed addresses are the official Chainlink reference-data-directory proxies
 * on Hedera testnet (docs.hedera.com). HBAR/USD verified live 2026-09-21 by
 * independent latestRoundData reads on both the v1.2 gate and the Phase 2
 * repeat. A second published testnet address set (0xfad5…, 0xf600…, 0x9e75…
 * from community plugins) returned empty eth_call — dead proxies. Pin the
 * reference-data-directory set only.
 */

import type { FeedReading } from '@provenance-swarm/swarm';

export interface FeedSpec {
  /** Feed pair label, e.g. 'HBAR/USD'. */
  pair: string;
  /** Pinned proxy contract address (checksummed). */
  address: string;
  /** Feed answer decimals (8 for the Hedera USD feeds). */
  decimals: number;
  /**
   * Smallest units per whole coin as a bigint: tinybar 1e8, wei 1e18,
   * satoshi 1e8. Converts declaredValue.amount into whole units.
   */
  unitScale: bigint;
}

/** The pinned testnet feed registry. Addresses compared case-insensitively. */
export const CHAINLINK_FEEDS_TESTNET: Record<'HBAR' | 'ETH' | 'BTC', FeedSpec> = {
  HBAR: {
    pair: 'HBAR/USD',
    address: '0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a',
    decimals: 8,
    unitScale: 100_000_000n,
  },
  ETH: {
    pair: 'ETH/USD',
    address: '0xb9d461e0b962aF219866aDfA7DD19C52bB9871b9',
    decimals: 8,
    unitScale: 1_000_000_000_000_000_000n,
  },
  BTC: {
    pair: 'BTC/USD',
    address: '0x058fE79CB5775d4b167920Ca6036B824805A9ABd',
    decimals: 8,
    unitScale: 100_000_000n,
  },
} as const;

export function feedForCurrency(currency: string): FeedSpec | undefined {
  return (CHAINLINK_FEEDS_TESTNET as Record<string, FeedSpec>)[currency];
}

/**
 * Maximum age of a live round at ATTESTATION time, in seconds. Enforced by
 * attestClaimValue (the only place a wall-clock read is honest) — never by
 * the sync worker/verifier path, which must recompute identically forever.
 * Generous on purpose for testnet heartbeat behavior; fossils still get
 * rejected before they can become evidence.
 */
export const FEED_MAX_STALENESS_SEC = 86_400; // 24h

/**
 * Allowance for clock skew between the round's updatedAt and the observer's
 * clock. Used at attestation (vs. wall clock) AND in the sync path as a
 * committed-value consistency bound (a reading cannot postdate the evidence
 * that contains it by more than this).
 */
export const FEED_FUTURE_SKEW_SEC = 300; // 5 min

/** Pass band: declared/implied ratio must land in [0.5, 2.0], inclusive. */
export const VALUE_BAND_LOW_NUM = 1n;
export const VALUE_BAND_LOW_DEN = 2n; // 0.5x
export const VALUE_BAND_HIGH_NUM = 2n;
export const VALUE_BAND_HIGH_DEN = 1n; // 2x

/**
 * The committed cassette: one real observed HBAR/USD round, pinned for
 * deterministic offline demos and unit tests. Evidence built on it carries
 * mode:'cassette' explicitly — a cassette is never presented as live oracle
 * evidence.
 *
 * Recorded 2026-09-21 via latestRoundData() on testnet.hashio.io (same round
 * the v1.2 reference gate pinned). Inlined as a literal so the constant works
 * identically under tsc, tsx, and the Next.js bundler.
 */
export const CHAINLINK_CASSETTE_READING: FeedReading = {
  pair: 'HBAR/USD',
  feedAddress: '0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a',
  roundId: '18446744073709595481',
  answer: '9308267',
  updatedAt: 1790031828,
  decimals: 8,
  answeredInRound: '18446744073709595481',
  mode: 'cassette',
};
