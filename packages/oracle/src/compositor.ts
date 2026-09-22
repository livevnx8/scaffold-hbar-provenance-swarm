/**
 * Provenance Swarm Template — multi-feed compositor
 *
 * Fixed-point economics over committed feed readings. All arithmetic is
 * BigInt — no floats in any hashed or compared path (same discipline as
 * confidenceBp in the v1.1 receipt construction).
 *
 *   impliedUsdCents = amount * answer * 100 / (unitScale * 10^decimals)
 *
 * The band check compares the true ratio declared/implied cross-multiplied,
 * so the decision never sees a floored value:
 *
 *   ratio >= 0.5  <=>  declared * scale * LOW_DEN  >= valueNum * LOW_NUM
 *   ratio <= 2.0  <=>  declared * scale * HIGH_DEN <= valueNum * HIGH_NUM
 *
 * where scale = unitScale * 10^decimals and valueNum = amount * answer * 100.
 */

import type { DeclaredValue, FeedReading } from '@provenance-swarm/swarm';
import {
  feedForCurrency,
  VALUE_BAND_LOW_NUM,
  VALUE_BAND_LOW_DEN,
  VALUE_BAND_HIGH_NUM,
  VALUE_BAND_HIGH_DEN,
} from './feeds.js';

/** Parse a positive-integer decimal string to bigint; null if malformed. */
export function parseDecimalInt(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/**
 * The feed-implied USD value of `amount` smallest units, in integer cents
 * (floored). Display + committed-evidence value; the band decision uses the
 * exact rational below, not this floor.
 */
export function compositeUsdCents(amount: bigint, reading: FeedReading): bigint {
  const scale = feedScale(reading);
  return (amount * BigInt(reading.answer) * 100n) / scale;
}

/** unitScale * 10^decimals for the reading's currency feed. */
function feedScale(reading: FeedReading): bigint {
  const spec = feedForCurrency(pairCurrency(reading.pair));
  const unitScale = spec?.unitScale ?? 100_000_000n;
  return unitScale * 10n ** BigInt(reading.decimals);
}

/** 'HBAR/USD' -> 'HBAR'. */
function pairCurrency(pair: string): string {
  return pair.split('/')[0] ?? '';
}

/**
 * Exact band check: is declaredCents within [0.5x, 2x] of the feed-implied
 * value of `amount` at `reading`? Cross-multiplied integer comparison —
 * inclusive edges, no rounding epsilon.
 */
export function withinBand(
  declaredCents: bigint,
  amount: bigint,
  reading: FeedReading,
): boolean {
  const scale = feedScale(reading);
  const valueNum = amount * BigInt(reading.answer) * 100n;
  return (
    declaredCents * scale * VALUE_BAND_LOW_DEN >= valueNum * VALUE_BAND_LOW_NUM &&
    declaredCents * scale * VALUE_BAND_HIGH_DEN <= valueNum * VALUE_BAND_HIGH_NUM
  );
}

/**
 * Display helpers — integer math only. ratioBp is the declared/implied
 * ratio in basis points (floored); format as "1.23x".
 */
export function ratioBasisPoints(
  declaredCents: bigint,
  amount: bigint,
  reading: FeedReading,
): bigint | null {
  const scale = feedScale(reading);
  const valueNum = amount * BigInt(reading.answer) * 100n;
  if (valueNum <= 0n) return null;
  return (declaredCents * scale * 10_000n) / valueNum;
}

export function formatRatio(ratioBp: bigint | null): string {
  if (ratioBp === null) return 'n/a';
  // ratioBp is ratio * 10000 (basis points): 1.00x = 10000, 100.00x = 1000000.
  const whole = ratioBp / 10000n;
  const frac = (ratioBp % 10000n) / 100n;
  return `${whole}.${frac.toString().padStart(2, '0')}x`;
}

/** cents -> "$1,200.00" display string. */
export function formatUsd(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const dollars = abs / 100n;
  const rem = abs % 100n;
  const grouped = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}$${grouped}.${rem.toString().padStart(2, '0')}`;
}

/** Whole-unit price display: answer/10^decimals -> "$0.09308267". */
export function formatPrice(answer: string, decimals: number): string {
  const a = BigInt(answer);
  const scale = 10n ** BigInt(decimals);
  const whole = a / scale;
  const frac = (a % scale).toString().padStart(decimals, '0');
  return `$${whole}.${frac}`;
}

/** Validate declaredValue field shape; returns an error string or null. */
export function declaredValueError(value: DeclaredValue | undefined): string | null {
  if (!value) return 'declaredValue is missing';
  const amount = parseDecimalInt(value.amount);
  const usd = parseDecimalInt(value.usdEquivalent);
  if (amount === null || amount <= 0n) {
    return `declaredValue.amount must be a positive integer string; got ${String(value.amount)}`;
  }
  if (usd === null || usd <= 0n) {
    return `declaredValue.usdEquivalent must be a positive integer string (USD cents); got ${String(value.usdEquivalent)}`;
  }
  if (!feedForCurrency(value.currency)) {
    return `declaredValue.currency must be one of HBAR|ETH|BTC; got ${String(value.currency)}`;
  }
  return null;
}
