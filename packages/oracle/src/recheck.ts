/**
 * Provenance Swarm Template — on-chain re-check of committed oracle evidence
 *
 * The sync value worker only checks that claim.oracleEvidence is internally
 * consistent. A caller who posts straight to /api/anchor can commit a
 * fabricated "live" round with a convenient answer, and the sync path cannot
 * tell. This module closes that gap: for every committed reading it re-reads
 * getRoundData(roundId) from the pinned Chainlink proxy and requires every
 * field to match what the chain returns.
 *
 * Async and network-bound by design (it is the anchor-time and third-party
 * audit path). The deterministic core never imports it. Tests and the demo
 * inject a RecordedPriceFeed so they stay offline.
 */

import type { FeedReading, ProvenanceClaim } from '@provenance-swarm/swarm';
import { CHAINLINK_FEEDS_TESTNET, type FeedSpec } from './feeds.js';
import { HashioPriceFeed, type PriceFeedPort } from './reader.js';

export type OracleRecheckFailure = 'no-evidence' | 'unknown-feed' | 'mismatch' | 'feed-unreachable';

export interface ReadingRecheck {
  pair: string;
  roundId: string;
  ok: boolean;
  /** Field-level differences between the committed reading and the chain. */
  mismatches: string[];
  error?: string;
}

export interface OracleRecheckResult {
  ok: boolean;
  /** Set when ok is false. mismatch/unknown-feed mean forged evidence; feed-unreachable means retry. */
  failure?: OracleRecheckFailure;
  checks: ReadingRecheck[];
}

export type FeedPortFactory = (spec: FeedSpec) => PriceFeedPort;

const defaultPortFor: FeedPortFactory = (spec) => new HashioPriceFeed(spec.address, spec.pair);

function specFor(reading: FeedReading): FeedSpec | undefined {
  return Object.values(CHAINLINK_FEEDS_TESTNET).find(
    (s) =>
      s.pair === reading.pair && s.address.toLowerCase() === String(reading.feedAddress).toLowerCase(),
  );
}

function diff(committed: FeedReading, chain: FeedReading): string[] {
  const out: string[] = [];
  const fields: (keyof FeedReading)[] = ['roundId', 'answer', 'updatedAt', 'decimals', 'answeredInRound'];
  for (const f of fields) {
    if (String(committed[f]) !== String(chain[f])) {
      out.push(`${f}: committed ${String(committed[f])}, chain ${String(chain[f])}`);
    }
  }
  return out;
}

/**
 * Re-read every committed round on-chain. A claim with neither declaredValue
 * nor oracleEvidence passes trivially (there is nothing to check). A claim
 * that declares value but carries no evidence fails (no-evidence).
 */
export async function recheckOracleEvidenceOnChain(
  claim: ProvenanceClaim,
  portFor: FeedPortFactory = defaultPortFor,
): Promise<OracleRecheckResult> {
  const readings = claim.oracleEvidence?.readings;
  if (!claim.declaredValue && !claim.oracleEvidence) return { ok: true, checks: [] };
  if (!Array.isArray(readings) || readings.length === 0) {
    return { ok: false, failure: 'no-evidence', checks: [] };
  }

  const checks: ReadingRecheck[] = [];
  let unknownFeed = false;
  let mismatch = false;
  let unreachable = false;

  for (const reading of readings) {
    const base = { pair: String(reading?.pair), roundId: String(reading?.roundId) };
    const spec = reading ? specFor(reading) : undefined;
    if (!spec) {
      unknownFeed = true;
      checks.push({ ...base, ok: false, mismatches: [], error: 'feed is not in the pinned Chainlink registry' });
      continue;
    }
    if (!/^\d+$/.test(base.roundId)) {
      mismatch = true;
      checks.push({ ...base, ok: false, mismatches: [], error: 'roundId is not a decimal integer' });
      continue;
    }
    let chain: FeedReading;
    try {
      chain = await portFor(spec).getRound(base.roundId);
    } catch (err) {
      unreachable = true;
      checks.push({
        ...base,
        ok: false,
        mismatches: [],
        error: `getRoundData failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    const mismatches = diff(reading, chain);
    if (mismatches.length) mismatch = true;
    checks.push({ ...base, ok: mismatches.length === 0, mismatches });
  }

  // Proof of forgery outranks a transient read failure.
  const failure: OracleRecheckFailure | undefined = unknownFeed
    ? 'unknown-feed'
    : mismatch
      ? 'mismatch'
      : unreachable
        ? 'feed-unreachable'
        : undefined;
  return failure ? { ok: false, failure, checks } : { ok: true, checks };
}

/**
 * Offline PriceFeedPort over recorded getRoundData responses. Unknown rounds
 * throw, like a feed that cannot serve them.
 */
export class RecordedPriceFeed implements PriceFeedPort {
  constructor(private readonly rounds: FeedReading[]) {}

  async getRound(roundId: string): Promise<FeedReading> {
    const hit = this.rounds.find((r) => r.roundId === roundId);
    if (!hit) throw new Error(`round ${roundId} not recorded`);
    return { ...hit };
  }

  async getLatestRound(): Promise<FeedReading> {
    const last = this.rounds[this.rounds.length - 1];
    if (!last) throw new Error('no recorded rounds');
    return { ...last };
  }
}
