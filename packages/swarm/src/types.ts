/**
 * Provenance Swarm Template — Domain Types
 *
 * A provenance claim describes a product's journey: where it was grown/made,
 * who held it along the way, and the documents that back it up. Workers verify
 * each dimension; the receipt binds the whole claim with SHA-256 hashes.
 */

export interface OriginAttestation {
  farm: string;
  region: string;
  /** ISO date, YYYY-MM-DD */
  harvestDate: string;
  statement: string;
  /**
   * sha256 hex of the canonical JSON array [farm, region, harvestDate, statement].
   * Produced by attestationHashFor(); never a delimiter-joined string (F3).
   */
  attestationHash: string;
}

export interface CustodyLink {
  holder: string;
  /** ISO datetime */
  receivedAt: string;
  /**
   * sha256 hex of the canonical JSON array [prevHolder, holder, receivedAt].
   * Produced by handoffHashFor(); never a delimiter-joined string (F3).
   */
  handoffHash: string;
}

export interface ProvenanceDocument {
  name: string;
  /** 64-char lowercase hex */
  sha256: string;
}

/**
 * Declared shipment value — the fourth claim dimension (Phase 2).
 * The claimant asserts both the native amount (in the currency's smallest
 * unit) and its USD equivalent; the oracle worker recomputes the USD value
 * from a committed Chainlink round and requires the declared equivalent
 * within the 0.5x–2x band. All amounts are decimal strings — integer math
 * throughout, no floats in hashed or compared data.
 */
export interface DeclaredValue {
  /** Amount in the currency's smallest unit (tinybar/wei/satoshi), decimal string. */
  amount: string;
  currency: 'HBAR' | 'ETH' | 'BTC';
  /** Claimant-declared USD equivalent in integer cents, decimal string. */
  usdEquivalent: string;
}

/**
 * One observed Chainlink price-feed round, committed into the claim as
 * oracle evidence. All integer fields are decimal strings (JSON-safe).
 * `mode` records provenance: 'live' = read from the feed at attestation
 * time, 'cassette' = pinned recorded round for deterministic offline
 * demos/tests (never presented as live evidence).
 */
export interface FeedReading {
  /** Feed pair label, e.g. 'HBAR/USD'. */
  pair: string;
  /** Feed proxy contract address — must match the pinned registry. */
  feedAddress: string;
  /** uint80 round id as a decimal string (phase-prefixed on Chainlink). */
  roundId: string;
  /** int256 answer as a decimal string (price * 10^decimals). */
  answer: string;
  /** Unix seconds when the round was published. */
  updatedAt: number;
  /** Feed decimals (8 for the Hedera testnet USD feeds). */
  decimals: number;
  /** uint80 answeredInRound as a decimal string; must be >= roundId. */
  answeredInRound: string;
  mode: 'live' | 'cassette';
}

/**
 * The attestation artifact: the feed observations the declared value was
 * checked against, plus the composite USD value computed from them.
 * Attached to the claim by the async attestation step BEFORE the swarm
 * runs, so taskHash binds it and the anchor gate's re-run sees identical
 * input. Workers never read feeds — they evaluate committed evidence.
 */
export interface OracleEvidence {
  readings: FeedReading[];
  /** Feed-implied USD value of the declared amount, integer cents as a decimal string. */
  compositeUsdCents: string;
  /** Unix seconds when the evidence was produced (attestation time). */
  computedAt: number;
}

export interface ProvenanceClaim {
  claimId: string;
  product: string;
  lot: string;
  origin: OriginAttestation;
  custody: CustodyLink[];
  documents: ProvenanceDocument[];
  /**
   * Optional declared shipment value. When present, the pipeline appends
   * the value-attestation worker (four workers) and requires oracleEvidence;
   * when absent, the claim verifies with the original three workers.
   */
  declaredValue?: DeclaredValue;
  /**
   * Oracle evidence committed at attestation time. Bound by taskHash.
   * Required iff declaredValue is present; produced by attestClaimValue()
   * in @provenance-swarm/oracle — never by the workers themselves.
   */
  oracleEvidence?: OracleEvidence;
}

export interface WorkerVerdict {
  workerId: string;
  name: string;
  specialty: string;
  passed: boolean;
  /** 0..1 */
  confidence: number;
  findings: string[];
}

export type ProvenanceVerdict = 'verified' | 'needs_review' | 'rejected';

export interface ProvenanceReceipt {
  /**
   * Hash-construction version. '1.0' = legacy delimiter-framed worker payload
   * (verifiable, but with demonstrated collision class F2/F3). '1.1' =
   * structured canonical payload. The verifier recomputes per this field.
   */
  version: ReceiptVersion;
  timestamp: number;
  claimId: string;
  taskHash: string;
  decisionHash: string;
  verdict: ProvenanceVerdict;
  results: WorkerVerdict[];
}

/** Receipt hash-construction versions. '1.1' is current; '1.0' stays readable. */
export type ReceiptVersion = '1.0' | '1.1';

export interface VerificationCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface VerificationResult {
  ok: boolean;
  checks: VerificationCheck[];
}
