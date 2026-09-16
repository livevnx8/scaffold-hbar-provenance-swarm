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
  /** sha256 hex of "farm|region|harvestDate|statement" */
  attestationHash: string;
}

export interface CustodyLink {
  holder: string;
  /** ISO datetime */
  receivedAt: string;
  /** sha256 hex of "previousHolder|holder|receivedAt" */
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
  version: '1.0';
  timestamp: number;
  claimId: string;
  taskHash: string;
  decisionHash: string;
  verdict: ProvenanceVerdict;
  results: WorkerVerdict[];
}

export interface VerificationCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface VerificationResult {
  ok: boolean;
  checks: VerificationCheck[];
}
