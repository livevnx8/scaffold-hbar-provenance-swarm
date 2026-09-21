/**
 * Provenance Swarm Template — Hashing utilities
 *
 * Self-contained: sha256, stable canonical JSON for deterministic task hashes,
 * and a 64-hex validator used by the document worker.
 */

import { createHash } from 'crypto';

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Deterministic JSON encoding: object keys sorted recursively, no whitespace. */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function isHex64(value: unknown): boolean {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

/**
 * Structured content hashes (receipt v1.1+).
 *
 * The preimage is a canonical JSON array of the fields, never a
 * delimiter-joined string. Delimiter-joined preimages admit collisions:
 * e.g. farm="Farm|A", region="EU" and farm="Farm", region="A|EU" produced
 * the identical "farm|region|..." string and therefore the identical hash
 * (adversarial finding F3, 2026-09-21). Hashing the structured tuple
 * closes the class.
 */
export function attestationHashFor(
  farm: string,
  region: string,
  harvestDate: string,
  statement: string,
): string {
  return sha256(canonicalize([farm, region, harvestDate, statement]));
}

export function handoffHashFor(
  prevHolder: string,
  holder: string,
  receivedAt: string,
): string {
  return sha256(canonicalize([prevHolder, holder, receivedAt]));
}
