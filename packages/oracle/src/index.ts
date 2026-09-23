/**
 * Provenance Swarm Template — Oracle package exports
 */

export {
  CHAINLINK_FEEDS_TESTNET,
  CHAINLINK_CASSETTE_READING,
  FEED_MAX_STALENESS_SEC,
  FEED_FUTURE_SKEW_SEC,
  VALUE_BAND_LOW_NUM,
  VALUE_BAND_LOW_DEN,
  VALUE_BAND_HIGH_NUM,
  VALUE_BAND_HIGH_DEN,
  feedForCurrency,
} from './feeds.js';
export type { FeedSpec } from './feeds.js';
export { HashioPriceFeed, HASHIO_TESTNET_RPC } from './reader.js';
export type { PriceFeedPort } from './reader.js';
export {
  parseDecimalInt,
  compositeUsdCents,
  withinBand,
  ratioBasisPoints,
  formatRatio,
  formatUsd,
  formatPrice,
  pairCurrency,
  declaredValueError,
} from './compositor.js';
export {
  verifyOracleEvidence,
  ORACLE_PASS_A,
  ORACLE_PASS_B,
} from './verifier.js';
export type { OracleVerification } from './verifier.js';
export { ValueAttestationWorker } from './worker.js';
export { attestClaimValue, AttestationError } from './attestation.js';
export type { AttestationErrorKind } from './attestation.js';
export { OracleProvenanceClient, createClient } from './client.js';
export { fixtureOracleEvidence, fixtureValueClaimWithEvidence } from './fixture.js';
