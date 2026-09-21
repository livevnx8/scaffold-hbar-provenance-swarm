/**
 * init:token — pure, keyless helpers.
 *
 * No network, no env access, no side effects in this module, except the
 * explicitly-marked lock-file helpers (acquireEnvLock) and the injectable
 * pollForToken sleeper. The CLI (init-token.ts) owns env access and network
 * I/O; everything testable lives here. Key strings passed in are parsed,
 * never logged or stored.
 */
import { createHash } from 'node:crypto';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { PrivateKey } from '@hashgraph/sdk';

export const TOKEN_ID_RE = /^\d+\.\d+\.\d+$/;
export const OPERATOR_ID_RE = /^\d+\.\d+\.\d+$/;

/** Matches `KEY=value`, tolerating leading whitespace and an `export` prefix. */
const ENV_LINE_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

/** Prefix used to retire stale live assignments. Lines are NEVER deleted. */
export const SUPERSEDE_PREFIX = '# superseded by init:token:';

export interface EnvOccurrence {
  index: number;
  value: string;
}

export interface ParsedEnv {
  /** File lines preserved verbatim (split on \n; a trailing '' element keeps a final newline byte-identical on re-join). */
  lines: string[];
}

/** Strip one layer of surrounding single/double quotes and trim whitespace. */
export function unquoteEnvValue(raw: string): string {
  const t = raw.trim();
  if (t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))) {
    return t.slice(1, -1);
  }
  return t;
}

export function parseEnvFile(text: string): ParsedEnv {
  // Preserve the file exactly: split on \n, keep a trailing '' element when the
  // file ends with a newline so re-joining is byte-identical.
  const lines = text.split('\n');
  return { lines };
}

/** All live occurrences of `key` in a parsed env file, in file order. Commented lines are not live. */
export function findOccurrences(parsed: ParsedEnv, key: string): EnvOccurrence[] {
  const out: EnvOccurrence[] = [];
  parsed.lines.forEach((line, index) => {
    const m = ENV_LINE_RE.exec(line);
    if (m && m[1] === key) out.push({ index, value: unquoteEnvValue(m[2]) });
  });
  return out;
}

/** Keys (other than `except`) that occur more than once. */
export function findDuplicateKeys(parsed: ParsedEnv, except?: string): string[] {
  const counts = new Map<string, number>();
  for (const line of parsed.lines) {
    const m = ENV_LINE_RE.exec(line);
    if (m && m[1] !== except) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

export type EnvUpdateAction = 'added' | 'superseded' | 'noop-same';

export interface EnvUpdate {
  lines: string[];
  action: EnvUpdateAction;
  /** Original text of the live lines that were commented out (empty when none). */
  superseded: string[];
  /** Unified-style diff of the change, for stdout. Empty for noop. */
  diff: string;
}

/**
 * Set KEY=value in env-file lines. Grok claim-8 semantics — lines are NEVER
 * deleted:
 * - No live occurrence: append `KEY=value` as a new line.
 * - Exactly one live occurrence already holding this value: no change (idempotent).
 * - Otherwise: comment out every live occurrence with
 *   `# superseded by init:token: <original line>` — EXCEPT when the LAST live
 *   occurrence already holds the desired value, in which case only the earlier
 *   ones are commented and the last is kept as the canonical line — then append
 *   one canonical `KEY=value` line when no live line already holds it.
 * Commented lines are not live, so a later run sees exactly one live assignment.
 */
export function setEnvValue(lines: string[], key: string, value: string): EnvUpdate {
  const idx: number[] = [];
  lines.forEach((line, i) => {
    const m = ENV_LINE_RE.exec(line);
    if (m && m[1] === key) idx.push(i);
  });
  const desired = `${key}=${value}`;
  if (idx.length === 0) {
    const next = [...lines, desired];
    return { lines: next, action: 'added', superseded: [], diff: diffEnvLines(lines, next) };
  }
  const liveValues = idx.map((i) => {
    const m = ENV_LINE_RE.exec(lines[i]) as RegExpExecArray;
    return unquoteEnvValue(m[2]);
  });
  if (idx.length === 1 && liveValues[0] === value) {
    return { lines, action: 'noop-same', superseded: [], diff: '' };
  }
  const next = [...lines];
  const superseded: string[] = [];
  const last = idx[idx.length - 1];
  const lastAlreadyCanonical = liveValues[liveValues.length - 1] === value;
  const toComment = lastAlreadyCanonical ? idx.slice(0, -1) : idx;
  for (const i of toComment) {
    superseded.push(next[i]);
    next[i] = `${SUPERSEDE_PREFIX} ${next[i]}`;
  }
  if (!lastAlreadyCanonical) next.push(desired);
  return { lines: next, action: 'superseded', superseded, diff: diffEnvLines(lines, next) };
}

/**
 * Minimal unified-style diff of two line arrays. Per-index walk (our edits
 * never reorder lines: they comment, replace in place, or append), with long
 * unchanged runs collapsed to `...`. Honest output for stdout, not a patch
 * format — never applied, only shown.
 */
export function diffEnvLines(oldLines: string[], newLines: string[]): string {
  type Row = { kind: ' ' | '-' | '+'; text: string };
  const rows: Row[] = [];
  const n = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < n; i++) {
    const a = oldLines[i];
    const b = newLines[i];
    if (a === b) rows.push({ kind: ' ', text: a ?? '' });
    else {
      if (a !== undefined) rows.push({ kind: '-', text: a });
      if (b !== undefined) rows.push({ kind: '+', text: b });
    }
  }
  const changed = rows.map((r, i) => (r.kind === ' ' ? -1 : i)).filter((i) => i >= 0);
  if (changed.length === 0) return '';
  const CONTEXT = 2;
  const keep = new Set<number>();
  for (const i of changed) {
    for (let k = Math.max(0, i - CONTEXT); k <= Math.min(rows.length - 1, i + CONTEXT); k++) keep.add(k);
  }
  const out = ['--- .env', '+++ .env'];
  let skipped = false;
  for (let i = 0; i < rows.length; i++) {
    if (!keep.has(i)) {
      if (!skipped) {
        out.push('  ...');
        skipped = true;
      }
      continue;
    }
    skipped = false;
    out.push(`${rows[i].kind} ${rows[i].text}`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Mirror-node token verification (read-only).
// ---------------------------------------------------------------------------

export type Curve = 'ed25519' | 'ecdsa';

export interface PubCandidate {
  curve: Curve;
  /** Lowercase hex of the raw public key bytes (32B ed25519, 33B compressed ecdsa). No 0x. */
  rawHex: string;
}

/** Typed key material: curve + bytes. Comparisons are always on this pair,
 *  never on "hex equal after stripping a prefix" (Grok claim 6). */
export interface KeyMaterial {
  curve: Curve;
  rawHex: string;
}

type MaterialResult = { ok: true; material: KeyMaterial } | { ok: false; detail: string };

export type KeyCheck = 'match' | 'mismatch' | 'indeterminate';

export interface KeyCheckResult {
  check: KeyCheck;
  detail: string;
}

interface ProtoField {
  field: number;
  wire: number;
  value: Buffer | bigint;
}

function readVarint(bytes: Buffer, pos: number): { value: bigint; next: number } | null {
  let value = 0n;
  let shift = 0n;
  let i = pos;
  while (i < bytes.length) {
    const b = bytes[i];
    i++;
    value |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value, next: i };
    shift += 7n;
    if (shift > 64n) return null;
  }
  return null;
}

/** Minimal protobuf field reader: varint (wire 0) and length-delimited (wire 2)
 *  only. Anything else (groups, fixed32/64) never appears in Hedera Key protos —
 *  fail closed by returning null. */
function parseProtoFields(bytes: Buffer): ProtoField[] | null {
  const out: ProtoField[] = [];
  let i = 0;
  while (i < bytes.length) {
    const tag = readVarint(bytes, i);
    if (!tag) return null;
    i = tag.next;
    const field = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n);
    if (wire === 0) {
      const v = readVarint(bytes, i);
      if (!v) return null;
      i = v.next;
      out.push({ field, wire, value: v.value });
    } else if (wire === 2) {
      const l = readVarint(bytes, i);
      if (!l) return null;
      i = l.next;
      const len = Number(l.value);
      if (len < 0 || i + len > bytes.length) return null;
      out.push({ field, wire, value: bytes.subarray(i, i + len) });
      i += len;
    } else {
      return null;
    }
  }
  return out;
}

/** Hedera `Key` proto field numbers: 1 contractID, 2 ed25519, 3 RSA_3072,
 *  4 ECDSA_384, 5 thresholdKey, 6 keylist, 7 ECDSA_secp256k1, 8 delegatable. */
const KEY_FIELDS = [1, 2, 3, 4, 5, 6, 7, 8];

function bareSingleKey(keyFields: ProtoField[]): MaterialResult {
  const singles = keyFields.filter((f) => f.field === 2 || f.field === 7);
  if (singles.length !== 1 || keyFields.length !== 1) return { ok: false, detail: 'not a bare single key' };
  const f = singles[0];
  if (f.wire !== 2) return { ok: false, detail: 'single-key field is not length-delimited' };
  const body = f.value as Buffer;
  if (f.field === 2 && body.length === 32) return { ok: true, material: { curve: 'ed25519', rawHex: body.toString('hex') } };
  if (f.field === 7 && body.length === 33) return { ok: true, material: { curve: 'ecdsa', rawHex: body.toString('hex') } };
  return { ok: false, detail: `single-key field ${f.field} has unexpected length ${body.length}` };
}

/**
 * Decode a Hedera `Key` protobuf into typed single-key material.
 * Accepted: bare ed25519 / ECDSA_secp256k1, and one level (recursively, depth
 * capped) of one-element KeyList or threshold-1 ThresholdKey wrapping exactly
 * the operator key — both are mintable on-chain and resolve to a single
 * signer. Anything else (2-of-N, contract key, empty, RSA, uninterpretable)
 * is fail-closed.
 */
function decodeKeyProto(bytes: Buffer, depth = 0): MaterialResult {
  if (depth > 4) return { ok: false, detail: 'key nesting too deep' };
  const fields = parseProtoFields(bytes);
  if (!fields) return { ok: false, detail: 'protobuf key undecodable' };
  const keyFields = fields.filter((f) => KEY_FIELDS.includes(f.field));
  const bare = bareSingleKey(keyFields);
  if (bare.ok) return bare;

  const lists = keyFields.filter((f) => f.field === 6);
  const thresholds = keyFields.filter((f) => f.field === 5);
  if (lists.length === 1 && keyFields.length === 1) {
    const inner = parseProtoFields(lists[0].value as Buffer);
    if (!inner) return { ok: false, detail: 'KeyList undecodable' };
    const keys = inner.filter((f) => f.field === 1);
    if (keys.length !== 1 || inner.length !== 1) return { ok: false, detail: 'KeyList does not hold exactly one key' };
    return decodeKeyProto(keys[0].value as Buffer, depth + 1);
  }
  if (thresholds.length === 1 && keyFields.length === 1) {
    const inner = parseProtoFields(thresholds[0].value as Buffer);
    if (!inner) return { ok: false, detail: 'ThresholdKey undecodable' };
    const thr = inner.filter((f) => f.field === 1);
    const ks = inner.filter((f) => f.field === 2);
    if (thr.length !== 1 || ks.length !== 1 || inner.length !== 2) {
      return { ok: false, detail: 'ThresholdKey shape unexpected' };
    }
    if ((thr[0].value as bigint) !== 1n) return { ok: false, detail: 'ThresholdKey threshold is not 1' };
    const kl = parseProtoFields(ks[0].value as Buffer);
    if (!kl) return { ok: false, detail: 'ThresholdKey KeyList undecodable' };
    const keys = kl.filter((f) => f.field === 1);
    if (keys.length !== 1 || kl.length !== 1) {
      return { ok: false, detail: 'ThresholdKey KeyList does not hold exactly one key' };
    }
    return decodeKeyProto(keys[0].value as Buffer, depth + 1);
  }
  const seen = keyFields.map((f) => f.field).join(',') || 'none';
  return { ok: false, detail: `protobuf key is not a single key or a one-element list (fields: ${seen})` };
}

/**
 * Normalize a mirror-node `supply_key` object to typed key material.
 * Both raw (`ED25519` / `ECDSA_SECP256K1`) and protobuf-wrapped encodings
 * normalize to the same {curve, rawHex} — a correct token never false-fails
 * on encoding (Grok vector 6). Anything unrecognized is fail-closed, never
 * assumed.
 */
export function extractKeyMaterial(supplyKey: unknown): MaterialResult {
  if (!supplyKey || typeof supplyKey !== 'object') {
    return { ok: false, detail: 'supply_key missing from mirror response' };
  }
  const sk = supplyKey as { _type?: unknown; key?: unknown };
  const type = typeof sk._type === 'string' ? sk._type : '';
  const raw = typeof sk.key === 'string' ? sk.key : '';
  const keyHex = raw.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]*$/.test(keyHex) || keyHex.length === 0 || keyHex.length % 2 !== 0) {
    return { ok: false, detail: 'supply_key is not hex' };
  }
  const bytes = Buffer.from(keyHex, 'hex');
  if (type === 'ED25519') {
    return bytes.length === 32
      ? { ok: true, material: { curve: 'ed25519', rawHex: bytes.toString('hex') } }
      : { ok: false, detail: `ED25519 supply key length ${bytes.length}, expected 32` };
  }
  if (type === 'ECDSA_SECP256K1') {
    return bytes.length === 33
      ? { ok: true, material: { curve: 'ecdsa', rawHex: bytes.toString('hex') } }
      : { ok: false, detail: `ECDSA_SECP256K1 supply key length ${bytes.length}, expected 33` };
  }
  if (type === 'ProtobufEncoded' || type === 'KeyList' || type === 'ThresholdKey' || type === '') {
    return decodeKeyProto(bytes);
  }
  return { ok: false, detail: `unrecognized supply_key _type "${type}"` };
}

/**
 * Compare normalized supply-key material against operator public-key
 * candidates. Typed comparison: the candidate must share the material's
 * curve AND bytes. A spurious cross-curve byte equality can never match.
 */
export function checkSupplyKey(supplyKey: unknown, candidates: PubCandidate[]): KeyCheckResult {
  const m = extractKeyMaterial(supplyKey);
  if (!m.ok) return { check: 'indeterminate', detail: m.detail };
  const cands = candidates.filter((c) => c.curve === m.material.curve);
  if (cands.length === 0) {
    return { check: 'mismatch', detail: `supply key is ${m.material.curve}, operator key is not ${m.material.curve}` };
  }
  const hit = cands.some((c) => c.rawHex.toLowerCase() === m.material.rawHex.toLowerCase());
  return hit
    ? { check: 'match', detail: `supply key (${m.material.curve}) matches operator public key` }
    : { check: 'mismatch', detail: `supply key (${m.material.curve}) bytes differ from operator public key` };
}

/**
 * Decode a mirror `ProtobufEncoded` supply key and compare. Kept as a thin
 * wrapper so existing callers/tests keep working; normalization lives in
 * extractKeyMaterial.
 */
export function checkProtobufKey(keyHex: string, candidates: PubCandidate[]): KeyCheckResult {
  return checkSupplyKey({ _type: 'ProtobufEncoded', key: keyHex }, candidates);
}

/** Warn when the remaining finite supply drops below this fraction of max_supply. */
export const LOW_SUPPLY_WARN_FRACTION = 0.1;

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export interface TokenVerification {
  ok: boolean;
  failures: string[];
  notes: string[];
}

/**
 * Verify a mirror-node token object against the operator. Every hard
 * requirement must hold; anything uncertain is a failure (fail closed).
 * Name/symbol drift from the template default is a note, not a failure —
 * mintCertificate only needs type + treasury + supply key.
 *
 * `deleted === null` (or absent) counts as not-deleted ONLY when the full
 * type/treasury/supply-key checks below pass — there is no separate
 * deleted check to lean on.
 */
export function verifyTokenJson(
  token: Record<string, unknown>,
  operatorId: string,
  candidates: PubCandidate[],
): TokenVerification {
  const failures: string[] = [];
  const notes: string[] = [];

  if (token['deleted'] === true) failures.push('token is deleted');
  if (token['type'] !== 'NON_FUNGIBLE_UNIQUE') {
    failures.push(`token type is "${token['type']}", expected NON_FUNGIBLE_UNIQUE`);
  }
  if (token['treasury_account_id'] !== operatorId) {
    failures.push(
      `treasury is "${token['treasury_account_id']}", expected operator ${operatorId} (mintCertificate mints from the operator account)`,
    );
  }
  const kc = checkSupplyKey(token['supply_key'], candidates);
  if (kc.check === 'match') {
    notes.push(`supply key: ${kc.detail}`);
  } else {
    failures.push(`supply key ${kc.check}: ${kc.detail}`);
  }

  // Grok claim 3: pause state gates minting.
  const pauseStatus = token['pause_status'];
  if (pauseStatus === 'PAUSED') {
    failures.push('token is PAUSED — mint would hard-fail');
  } else if (pauseStatus != null && pauseStatus !== 'UNPAUSED' && pauseStatus !== 'NOT_APPLICABLE') {
    failures.push(`unrecognized pause_status "${String(pauseStatus)}" — fail closed`);
  }

  // Grok vector 1 (TOCTOU): a present admin key means the collection can be
  // reconfigured (treasury/supply key rotation) AFTER this verification.
  // Collections created by init:token never have one — its presence is alien.
  if (token['admin_key'] != null) {
    failures.push(
      'admin_key is present — the collection can be reconfigured after verification (TOCTOU); refusing',
    );
  }

  // Grok claim 3: a kyc gate would break the unattended mint path.
  if (token['kyc_key'] != null) {
    failures.push('kyc_key is present — mintCertificate expects no kyc gate');
  }

  // Grok claim 3: finite-supply exhaustion gates minting.
  if (token['supply_type'] === 'FINITE') {
    const max = toNum(token['max_supply']);
    const total = toNum(token['total_supply']);
    if (max == null || total == null) {
      failures.push('supply_type is FINITE but max_supply/total_supply are unreadable — fail closed');
    } else {
      const remaining = max - total;
      if (remaining <= 0) {
        failures.push(`finite supply exhausted (${total}/${max} minted) — mint would fail`);
      } else if (remaining < max * LOW_SUPPLY_WARN_FRACTION) {
        notes.push(
          `low remaining supply: ${remaining} of ${max} left (below ${LOW_SUPPLY_WARN_FRACTION * 100}% warn threshold)`,
        );
      }
    }
  } else if (token['supply_type'] === 'INFINITE') {
    notes.push('supply_type is INFINITE — no cap exhaustion risk');
  }

  // Grok claim 3: expiry is warn-only, never a failure — but with no admin key
  // it is FINAL, so the warning says so.
  if (token['expiry_timestamp'] != null) {
    notes.push(
      `collection expires at ${String(token['expiry_timestamp'])} — warn only. ` +
        'No admin key means expiry is final and no auto_renew_account can be attached later; plan treasury-funded renewal.',
    );
  }
  if (token['auto_renew_account'] == null && token['admin_key'] == null) {
    notes.push('no auto_renew_account and no admin key — this collection cannot be renewed or updated after creation; expiry is final');
  }

  if (token['name'] !== 'Provenance Certificate' || token['symbol'] !== 'PROVC') {
    notes.push(`name/symbol differ from template default ("${token['name']}" / "${token['symbol']}") — not blocking`);
  }
  return { ok: failures.length === 0, failures, notes };
}

// ---------------------------------------------------------------------------
// Operator key handling (parse only — never log or store).
// ---------------------------------------------------------------------------

/**
 * Derive operator public-key candidates from a key string. When `keyType` is
 * set we trust it (single candidate); otherwise both typed parsers are tried.
 * Raw 32-byte keys are curve-ambiguous — that is exactly why the template
 * documents HEDERA_KEY_TYPE. A spurious parse (e.g. ecdsa bytes read as
 * ed25519) yields a candidate that can never match a real supply key, because
 * the mirror comparison is typed on (curve, bytes) — see checkSupplyKey.
 *
 * Throws on unparseable input. Never logs the key.
 */
export function deriveCandidates(rawKey: string, keyType?: string): PubCandidate[] {
  const s = rawKey.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]+$/.test(s)) throw new Error('operator key is not hex');
  const out: PubCandidate[] = [];
  const attempt = (curve: Curve, fn: () => PrivateKey) => {
    try {
      const rawHex = Buffer.from(fn().publicKey.toBytesRaw()).toString('hex');
      if (!out.some((c) => c.curve === curve && c.rawHex === rawHex)) out.push({ curve, rawHex });
    } catch {
      /* not parseable as this curve */
    }
  };
  if (keyType === 'ed25519') attempt('ed25519', () => PrivateKey.fromStringED25519(s));
  else if (keyType === 'ecdsa') attempt('ecdsa', () => PrivateKey.fromStringECDSA(s));
  else if (keyType) throw new Error(`HEDERA_KEY_TYPE must be "ed25519" or "ecdsa", got "${keyType}"`);
  else {
    attempt('ed25519', () => PrivateKey.fromStringED25519(s));
    attempt('ecdsa', () => PrivateKey.fromStringECDSA(s));
  }
  if (out.length === 0) throw new Error('operator key could not be parsed as ed25519 or ecdsa');
  return out;
}

/** Public-key fingerprint for display (first 16 hex of sha256). The key itself is never shown. */
export function fingerprint(rawHex: string): string {
  return createHash('sha256').update(Buffer.from(rawHex, 'hex')).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Network mapping (Grok vector 3): the mirror base URL is DERIVED from
// HEDERA_NETWORK, and a mismatch between the configured network and the
// mirror being read is refused — the same numeric id can exist on two
// networks, so reading the wrong mirror would verify the wrong token.
// ---------------------------------------------------------------------------

export const MIRROR_BASES: Record<string, string> = {
  testnet: 'https://testnet.mirrornode.hedera.com/api/v1',
  previewnet: 'https://previewnet.mirrornode.hedera.com/api/v1',
  mainnet: 'https://mainnet.mirrornode.hedera.com/api/v1',
};

export function mirrorBaseFor(network: string): string {
  const base = MIRROR_BASES[network];
  if (!base) throw new Error(`unknown HEDERA_NETWORK "${network}" (expected testnet, previewnet, or mainnet)`);
  return base;
}

export function hashscanBaseFor(network: string): string {
  if (network === 'testnet') return 'https://hashscan.io/testnet';
  if (network === 'previewnet') return 'https://hashscan.io/previewnet';
  if (network === 'mainnet') return 'https://hashscan.io/mainnet';
  throw new Error(`unknown HEDERA_NETWORK "${network}" (expected testnet, previewnet, or mainnet)`);
}

// ---------------------------------------------------------------------------
// Mirror polling (Grok vector 2): after creating a token, the mirror lags.
// Retry with short backoff before verifying a just-created token —
// no instant-404 death. The fetch function is injectable for tests.
// ---------------------------------------------------------------------------

export interface TokenFetch {
  status: number;
  json: Record<string, unknown> | null;
}

export async function pollForToken(
  fetchOne: (tokenId: string) => Promise<TokenFetch>,
  tokenId: string,
  attempts = 6,
  delayMs = 2000,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<TokenFetch & { attemptsUsed: number }> {
  let last: TokenFetch = { status: 0, json: null };
  for (let i = 1; i <= attempts; i++) {
    try {
      last = await fetchOne(tokenId);
    } catch {
      last = { status: 0, json: null }; // transient network error — retried, not fatal
    }
    if (last.status !== 404 && last.status !== 0) return { ...last, attemptsUsed: i };
    if (i < attempts) await sleep(delayMs);
  }
  return { ...last, attemptsUsed: attempts };
}

// ---------------------------------------------------------------------------
// Run locking (Grok vector 4): two concurrent init:token runs against the
// same target .env could interleave reads/writes and double-create. The lock
// file is exclusive-created ('wx') and held for the whole run.
// ---------------------------------------------------------------------------

export interface EnvLock {
  lockPath: string;
  release(): void;
}

export function acquireEnvLock(envPath: string): EnvLock {
  const lockPath = `${envPath}.init-token.lock`;
  const stamp = `pid=${process.pid}\nstarted=${new Date().toISOString()}\n`;
  try {
    writeFileSync(lockPath, stamp, { flag: 'wx', mode: 0o600 });
  } catch {
    throw new Error(
      `another init:token run holds the lock for ${envPath} (${lockPath}). ` +
        'If no run is active, delete the lock file and retry.',
    );
  }
  let released = false;
  return {
    lockPath,
    release() {
      if (released) return;
      released = true;
      try {
        unlinkSync(lockPath);
      } catch {
        /* already gone */
      }
    },
  };
}

/**
 * Grok vector 5: mode 600 is not a security property on Windows/WSL.
 * Callers warn instead of pretending the chmod means something there.
 */
export function shouldWarnChmod(): boolean {
  if (process.platform === 'win32') return true;
  if (process.env.WSL_DISTRO_NAME) return true;
  try {
    if (/microsoft/i.test(readFileSync('/proc/version', 'utf8'))) return true;
  } catch {
    /* not linux */
  }
  return false;
}
