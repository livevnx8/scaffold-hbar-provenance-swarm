/**
 * Provenance Swarm Template — oracle evidence verifier
 *
 * verifyOracleEvidence evaluates a claim's declaredValue against its
 * committed oracleEvidence. Two check groups, reject-on-any-fail — the same
 * discipline as HieroDoubleVerifier's pass A / pass B:
 *
 *   Pass A — evidence integrity: readings well-formed, feed addresses pinned
 *            to the registry, every reading prices the DECLARED currency
 *            (currency_binding), round fields sane, compositeUsdCents recomputes
 *            exactly, committed-value consistency (computedAt cannot predate
 *            its own newest round; a reading cannot postdate the evidence
 *            beyond skew).
 *   Pass B — policy: declaredValue well-formed (positive integer strings,
 *            supported currency) and the declared/implied ratio inside the
 *            0.5x–2x band (exact rational, cross-multiplied).
 *
 * Everything here is pure and deterministic over committed claim data — no
 * wall-clock, no network. Freshness against the live clock is enforced once,
 * at attestation time, in attestation.ts.
 */

import type {
  ProvenanceClaim,
  FeedReading,
  VerificationCheck,
} from '@provenance-swarm/swarm';
import {
  feedForCurrency,
  FEED_FUTURE_SKEW_SEC,
} from './feeds.js';
import {
  parseDecimalInt,
  pairCurrency,
  compositeUsdCents,
  withinBand,
  declaredValueError,
} from './compositor.js';

export interface OracleVerification {
  ok: boolean;
  checks: VerificationCheck[];
}

function check(name: string, ok: boolean, detail: string): VerificationCheck {
  return { name, ok, detail };
}

/** Pass A check names (evidence integrity). */
export const ORACLE_PASS_A = [
  'evidence_present',
  'feed_registry',
  'currency_binding',
  'round_integrity',
  'composite_recompute',
  'evidence_consistency',
] as const;

/** Pass B check names (policy). */
export const ORACLE_PASS_B = ['declared_value_shape', 'value_band'] as const;

function validateReading(r: FeedReading): string | null {
  // A null/non-object reading must fail closed, not throw on field access.
  if (typeof r !== 'object' || r === null) {
    return 'reading is not an object';
  }
  // Type guards first: malformed field types must fail closed, not throw.
  if (
    typeof r.feedAddress !== 'string' ||
    typeof r.pair !== 'string' ||
    typeof r.answer !== 'string' ||
    typeof r.roundId !== 'string' ||
    typeof r.answeredInRound !== 'string' ||
    typeof r.mode !== 'string'
  ) {
    return 'reading fields have unexpected types';
  }
  const spec = feedForCurrency(r.pair.split('/')[0] ?? '');
  if (!spec || r.pair !== spec.pair) {
    return `unknown feed pair "${r.pair}"`;
  }
  if (r.feedAddress.toLowerCase() !== spec.address.toLowerCase()) {
    return `feed address ${r.feedAddress} is not the pinned ${r.pair} proxy ${spec.address}`;
  }
  const answer = parseDecimalInt(r.answer);
  const roundId = parseDecimalInt(r.roundId);
  const answeredInRound = parseDecimalInt(r.answeredInRound);
  if (answer === null || answer <= 0n) {
    return `round answer is not a positive integer (${r.answer})`;
  }
  // BigInt("") never reaches here (regex-gated), and "0" is rejected
  // explicitly — a zero round id must not pass the gates below.
  if (roundId === null || roundId <= 0n) {
    return `round id is not a positive integer (${r.roundId})`;
  }
  if (answeredInRound === null || answeredInRound <= 0n) {
    return `answeredInRound is not a positive integer (${r.answeredInRound})`;
  }
  if (answeredInRound < roundId) {
    return `incomplete round: answeredInRound ${r.answeredInRound} < roundId ${r.roundId}`;
  }
  if (!Number.isSafeInteger(r.updatedAt) || r.updatedAt <= 0) {
    return 'round updatedAt is not a positive integer';
  }
  if (!Number.isSafeInteger(r.decimals) || r.decimals <= 0 || r.decimals > 18) {
    return `round decimals out of sane range: ${String(r.decimals)}`;
  }
  if (r.decimals !== spec.decimals) {
    return `round decimals ${r.decimals} != registry decimals ${spec.decimals} for ${r.pair}`;
  }
  if (r.mode !== 'live' && r.mode !== 'cassette') {
    return `unknown round mode "${r.mode}"`;
  }
  return null;
}

export function verifyOracleEvidence(claim: ProvenanceClaim): OracleVerification {
  const checks: VerificationCheck[] = [];

  // ---- Pass A: evidence integrity -------------------------------------

  const evidence = claim.oracleEvidence;
  const evidencePresent =
    !!evidence &&
    Array.isArray(evidence.readings) &&
    evidence.readings.length > 0 &&
    Number.isSafeInteger(evidence.computedAt) &&
    evidence.computedAt > 0;
  checks.push(
    check(
      'evidence_present',
      evidencePresent,
      evidencePresent
        ? `${evidence!.readings.length} feed reading(s), computedAt ${evidence!.computedAt}`
        : 'declared value present but oracle evidence missing or malformed',
    ),
  );

  let readingsOk = false;
  let readingError = 'no readings to validate';
  if (evidencePresent) {
    for (const r of evidence!.readings) {
      const err = validateReading(r);
      if (err) {
        readingError = err;
        break;
      }
      readingError = '';
    }
    readingsOk = readingError === '';
  }
  checks.push(
    check(
      'feed_registry',
      readingsOk,
      readingsOk
        ? 'all readings pinned to registry feeds'
        : `reading failed registry/integrity gates: ${readingError}`,
    ),
  );

  // Currency binding: every reading must price the DECLARED currency.
  // Without this, a claim declaring HBAR could attach a BTC/USD reading and
  // pass the band against the friendliest registered feed's price. The
  // honest producer (attestation.ts) always writes one reading for the
  // declared currency, so this is fail-closed with no honest false refusal.
  const declaredCurrency = claim.declaredValue?.currency;
  let bindingOk = false;
  let bindingDetail = 'no declared currency to bind readings to';
  if (evidencePresent && readingsOk && typeof declaredCurrency === 'string') {
    const bad = evidence!.readings.find(r => pairCurrency(r.pair) !== declaredCurrency);
    bindingOk = !bad;
    bindingDetail = bindingOk
      ? `all ${evidence!.readings.length} reading(s) price the declared currency ${declaredCurrency}`
      : `reading ${bad!.pair} does not price the declared currency ${declaredCurrency}`;
  }
  checks.push(check('currency_binding', bindingOk, bindingDetail));

  // Round integrity is folded into feed_registry's per-reading gates; keep a
  // separate named check for the answeredInRound/positivity class so reports
  // distinguish "wrong feed" from "malformed round". Gated on readingsOk so
  // a non-object reading (already refused above) cannot throw here.
  const roundIntegrityOk =
    evidencePresent &&
    readingsOk &&
    evidence!.readings.every(r => {
      const roundId = parseDecimalInt(r.roundId);
      const answered = parseDecimalInt(r.answeredInRound);
      const answer = parseDecimalInt(r.answer);
      return (
        roundId !== null &&
        roundId > 0n &&
        answered !== null &&
        answered >= roundId &&
        answer !== null &&
        answer > 0n &&
        Number.isSafeInteger(r.updatedAt) &&
        r.updatedAt > 0
      );
    });
  checks.push(
    check(
      'round_integrity',
      roundIntegrityOk,
      roundIntegrityOk
        ? 'round ids, answers, and timestamps well-formed'
        : 'a reading has non-positive or inconsistent round fields',
    ),
  );

  // Composite recompute: the committed compositeUsdCents must equal the
  // exact fixed-point recomputation from the readings + declared amount.
  let compositeOk = false;
  let compositeDetail = 'cannot recompute without evidence and declared value';
  const amount = parseDecimalInt(claim.declaredValue?.amount);
  if (evidencePresent && readingsOk && amount !== null && amount > 0n) {
    const expected = compositeUsdCents(amount, evidence!.readings[0]);
    const committed = parseDecimalInt(evidence!.compositeUsdCents);
    compositeOk = committed !== null && committed === expected;
    compositeDetail = compositeOk
      ? `compositeUsdCents ${expected} recomputes from the committed round`
      : `committed ${evidence!.compositeUsdCents} != recomputed ${expected}`;
  }
  checks.push(check('composite_recompute', compositeOk, compositeDetail));

  // Committed-value consistency: evidence cannot predate its own newest
  // round, and no reading may postdate the evidence beyond the skew
  // allowance. Both sides are committed values — deterministic forever.
  let consistencyOk = false;
  let consistencyDetail = 'no evidence';
  if (evidencePresent && readingsOk) {
    // No Math.max(...) spread: a hostile claim could pack a huge readings
    // array and turn the spread into a stack overflow. A loop cannot throw.
    let maxUpdated = 0;
    for (const r of evidence!.readings) {
      if (r.updatedAt > maxUpdated) maxUpdated = r.updatedAt;
    }
    const notPredated = evidence!.computedAt >= maxUpdated;
    const notPostdated = evidence!.readings.every(
      r => r.updatedAt <= evidence!.computedAt + FEED_FUTURE_SKEW_SEC,
    );
    consistencyOk = notPredated && notPostdated;
    consistencyDetail = consistencyOk
      ? `computedAt ${evidence!.computedAt} >= newest round ${maxUpdated}`
      : !notPredated
        ? `computedAt ${evidence!.computedAt} predates newest round ${maxUpdated}`
        : `a reading postdates computedAt by more than ${FEED_FUTURE_SKEW_SEC}s skew`;
  }
  checks.push(check('evidence_consistency', consistencyOk, consistencyDetail));

  // ---- Pass B: policy ---------------------------------------------------

  const shapeError = declaredValueError(claim.declaredValue);
  checks.push(
    check(
      'declared_value_shape',
      shapeError === null,
      shapeError ?? 'declaredValue well-formed (positive integers, supported currency)',
    ),
  );

  let bandOk = false;
  let bandDetail = 'cannot evaluate band without valid evidence and declared value';
  if (evidencePresent && readingsOk && shapeError === null) {
    const declared = parseDecimalInt(claim.declaredValue!.usdEquivalent)!;
    bandOk = withinBand(declared, amount!, evidence!.readings[0]);
    bandDetail = bandOk
      ? 'declared/implied ratio inside the 0.5x-2x band'
      : 'declared/implied ratio outside the 0.5x-2x band';
  }
  checks.push(check('value_band', bandOk, bandDetail));

  return { ok: checks.every(c => c.ok), checks };
}
