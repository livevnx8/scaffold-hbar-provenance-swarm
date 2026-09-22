/**
 * Provenance Swarm Template — Chainlink price-feed reader (I/O boundary)
 *
 * Boundary module: all eth_call I/O lives here, behind the PriceFeedPort
 * interface. The deterministic core (worker, verifier, client) never touches
 * the network — attestClaimValue() is the only caller, and it runs BEFORE
 * the swarm, committing what it observes into claim.oracleEvidence.
 *
 * Read-only: plain fetch + eth_call against Hashio. No keys, no signer,
 * no writes, no new dependencies.
 */

import type { FeedReading } from '@provenance-swarm/swarm';
import { CHAINLINK_FEEDS_TESTNET } from './feeds.js';

/** Public JSON-RPC endpoint used for the live feed path. No API key. */
export const HASHIO_TESTNET_RPC = 'https://testnet.hashio.io/api';

/** Port: something that can observe Chainlink rounds for one feed. */
export interface PriceFeedPort {
  /** The newest published round. */
  getLatestRound(): Promise<FeedReading>;
  /** A specific historical round (for re-validating committed evidence). */
  getRound(roundId: string): Promise<FeedReading>;
}

const LATEST_ROUND_DATA_SELECTOR = '0xfeaf968c'; // latestRoundData()
const GET_ROUND_DATA_SELECTOR = '0x9a6fc8f5'; // getRoundData(uint80)
const DECIMALS_SELECTOR = '0x313ce567'; // decimals()

function pad32hex(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}

function parseUint256(word: string): bigint {
  return BigInt('0x' + word);
}

function parseInt256(word: string): bigint {
  const v = BigInt('0x' + word);
  return v >= 1n << 255n ? v - (1n << 256n) : v;
}

interface RoundDataWords {
  roundId: bigint;
  answer: bigint;
  updatedAt: bigint;
  answeredInRound: bigint;
}

function decodeRoundData(hex: string): RoundDataWords {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length < 160) {
    throw new Error(`roundData returned short data (${clean.length} hex chars)`);
  }
  const words = [0, 1, 2, 3, 4].map(i => clean.slice(i * 64, (i + 1) * 64));
  return {
    roundId: parseUint256(words[0]),
    answer: parseInt256(words[1]),
    // words[2] is startedAt; unused.
    updatedAt: parseUint256(words[3]),
    answeredInRound: parseUint256(words[4]),
  };
}

/**
 * Live port over Hashio JSON-RPC, bound to one feed contract.
 * Defaults to the pinned HBAR/USD testnet proxy.
 */
export class HashioPriceFeed implements PriceFeedPort {
  constructor(
    private feedAddress: string = CHAINLINK_FEEDS_TESTNET.HBAR.address,
    private pair: string = CHAINLINK_FEEDS_TESTNET.HBAR.pair,
    private rpcUrl: string = HASHIO_TESTNET_RPC,
  ) {}

  private async ethCall(data: string): Promise<string> {
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Hashio's edge rejects requests with no UA (observed HTTP 403 on
        // 2026-09-21). Identify the template honestly; no spoofing.
        'user-agent':
          'scaffold-hbar-provenance-swarm/1.1 (+https://github.com/livevnx8/scaffold-hbar-provenance-swarm)',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: this.feedAddress, data }, 'latest'],
      }),
    });
    if (!res.ok) {
      throw new Error(`feed RPC HTTP ${res.status}`);
    }
    const body = (await res.json()) as { result?: string; error?: { message?: string } };
    if (body.error || typeof body.result !== 'string') {
      throw new Error(`feed RPC error: ${body.error?.message ?? 'no result'}`);
    }
    if (body.result === '0x' || body.result === '0x0') {
      throw new Error('feed returned empty data (wrong address or no proxy there)');
    }
    return body.result;
  }

  private async decimals(): Promise<number> {
    const raw = await this.ethCall(DECIMALS_SELECTOR);
    return Number(parseUint256(raw.slice(2, 66)));
  }

  private async readRound(data: string): Promise<FeedReading> {
    const [raw, decimals] = await Promise.all([this.ethCall(data), this.decimals()]);
    const w = decodeRoundData(raw);
    return {
      pair: this.pair,
      feedAddress: this.feedAddress,
      roundId: w.roundId.toString(),
      answer: w.answer.toString(),
      updatedAt: Number(w.updatedAt),
      decimals,
      answeredInRound: w.answeredInRound.toString(),
      mode: 'live',
    };
  }

  getLatestRound(): Promise<FeedReading> {
    return this.readRound(LATEST_ROUND_DATA_SELECTOR);
  }

  getRound(roundId: string): Promise<FeedReading> {
    return this.readRound(GET_ROUND_DATA_SELECTOR + pad32hex(BigInt(roundId)));
  }
}
