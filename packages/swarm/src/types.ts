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

export interface ProvenanceClaim {
  claimId: string;
  product: string;
  lot: string;
  origin: OriginAttestation;
  custody: CustodyLink[];
  documents: ProvenanceDocument[];
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
