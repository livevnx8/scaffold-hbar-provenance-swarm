#!/usr/bin/env node
/**
 * init:token — one-time HTS certificate-collection setup for the template.
 *
 * Reads operator credentials from process.env ONLY (never from the .env file
 * it writes). Invoke with:
 *   HEDERA_OPERATOR_ID=0.0.x HEDERA_OPERATOR_KEY=<key> npm run init:token -- \
 *     --env packages/nextjs/.env [--dry-run]
 *
 * Creates the collection via HederaAnchor.createCertificateToken() (same call
 * mintCertificate expects) and writes HEDERA_CERTIFICATE_TOKEN_ID.
 *
 * Exit codes: 0 = ok (created / verified / dry-run plan printed),
 *             1 = any refusal or failure. The private key is never printed.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HederaAnchor } from '../../src/index.js';
import {
  TOKEN_ID_RE,
  OPERATOR_ID_RE,
  parseEnvFile,
  findOccurrences,
  findDuplicateKeys,
  setEnvValue,
  verifyTokenJson,
  deriveCandidates,
  fingerprint,
  mirrorBaseFor,
  hashscanBaseFor,
  pollForToken,
  acquireEnvLock,
  shouldWarnChmod,
  type TokenFetch,
  type EnvLock,
} from './lib.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** packages/swarm/scripts/init-token → monorepo root */
const REPO_ROOT = resolve(__dirname, '../../../..');

const TOKEN_ENV_KEY = 'HEDERA_CERTIFICATE_TOKEN_ID';
const FETCH_TIMEOUT_MS = 15000;
const MIRROR_POLL_ATTEMPTS = 6;
const MIRROR_POLL_DELAY_MS = 2000;

const HELP = `init:token — one-time HTS certificate-collection setup for the template.

Usage:
  init-token.ts --env <path> [--dry-run] [--template-root <path>]
  init-token.ts --help

Environment (process env ONLY — never read from the target .env file):
  HEDERA_OPERATOR_ID   0.0.x account id (required)
  HEDERA_OPERATOR_KEY  operator private key hex (required; never printed)
  HEDERA_KEY_TYPE      ed25519 | ecdsa (required for raw 32-byte keys)
  HEDERA_NETWORK       testnet only (default: testnet)

Behavior:
  - If HEDERA_CERTIFICATE_TOKEN_ID is already set, the collection is verified
    on the mirror node (type, treasury, supply key, pause state, supply cap,
    no admin/kyc keys) — never replaced.
  - Otherwise a new collection is created via the repo's
    HederaAnchor.createCertificateToken() and the id is written to the .env.
  - Duplicate HEDERA_CERTIFICATE_TOKEN_ID lines are NEVER deleted: earlier
    live assignments are commented with "# superseded by init:token:", one
    canonical assignment line is appended, and a diff of the change is
    printed to stdout.
  - A lock file <env>.init-token.lock is held for the whole run; a second
    concurrent run against the same .env exits with a clear message.
  - The mirror base URL is derived from HEDERA_NETWORK; any mismatch is
    refused (the same numeric id can exist on two networks).

NOTES — read before running on anything you care about:
  1. No admin key. The created collection has no admin, freeze, wipe, or kyc
     keys, and no auto-renew account. Consequence: nobody can later attach an
     auto-renew account, rename the collection, or recover it after expiry.
     The collection WILL expire (default ~90 days) unless the treasury keeps
     funding renewal; expiry is final and unrecoverable. This immutability is
     the trust story — plan the treasury accordingly.
  2. Shared cap. One collection = one finite 100000 supply shared by every
     .env that points at it. Pointing a second environment at the same
     collection shares the cap; the verifier warns below 10% remaining.
  3. Operator binding. Verification binds the collection to the operator id/key
     you run with. If the app later mints with a different operator, this check
     cannot catch it — mint will fail at the supply-key signature step. Keep
     the operator consistent between init:token and the app.
  4. Consensus truth. For pre-existing ids, the mirror node is the source of
     truth; a configured-but-nonexistent id fails closed rather than
     auto-creating a replacement (a typo is more likely than an invitation).
`;

interface Args {
  envPath: string;
  dryRun: boolean;
}

function parseArgs(argv: string[], templateRoot: string): Args {
  let envPath = `${templateRoot}/packages/nextjs/.env`;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') {
      console.log(HELP);
      process.exit(0);
    } else if (argv[i] === '--env' && argv[i + 1]) envPath = resolve(argv[++i]);
    else if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--template-root' && argv[i + 1]) {
      templateRoot = resolve(argv[++i]);
      envPath = `${templateRoot}/packages/nextjs/.env`;
    } else {
      throw new Error(`unknown argument: ${argv[i]} (usage: --env <path> --dry-run --template-root <path> --help)`);
    }
  }
  return { envPath, dryRun };
}

function fail(msg: string): never {
  console.error(`init:token: ERROR: ${msg}`);
  process.exit(1);
}

function fetchToken(mirrorBase: string, tokenId: string): Promise<TokenFetch> {
  return (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${mirrorBase}/tokens/${tokenId}`, { signal: ctrl.signal });
      if (!res.ok) return { status: res.status, json: null };
      return { status: res.status, json: (await res.json()) as Record<string, unknown> };
    } finally {
      clearTimeout(timer);
    }
  })();
}

function readTargetEnv(envPath: string): { exists: boolean; parsed: ReturnType<typeof parseEnvFile> } {
  if (!existsSync(envPath)) return { exists: false, parsed: parseEnvFile('') };
  return { exists: true, parsed: parseEnvFile(readFileSync(envPath, 'utf8')) };
}

function writeTargetEnv(envPath: string, lines: string[], created: boolean): void {
  let text = lines.join('\n');
  if (!text.endsWith('\n')) text += '\n';
  if (created) mkdirSync(dirname(envPath), { recursive: true });
  writeFileSync(envPath, text, { mode: 0o600 });
  if (shouldWarnChmod()) {
    console.log(
      'warning: mode 600 could not be enforced on this platform (Windows/WSL) — ' +
        'the .env file may be readable by other users; restrict it manually.',
    );
  }
}

async function main(): Promise<void> {
  const templateRoot = process.env.INIT_TOKEN_TEMPLATE_ROOT ?? REPO_ROOT;
  const args = parseArgs(process.argv.slice(2), templateRoot);

  // --- operator credentials: process.env only --------------------------------
  const operatorId = (process.env.HEDERA_OPERATOR_ID ?? '').trim();
  const operatorKey = process.env.HEDERA_OPERATOR_KEY ?? '';
  const keyType = (process.env.HEDERA_KEY_TYPE ?? '').trim() || undefined;
  const network = (process.env.HEDERA_NETWORK ?? 'testnet').trim();

  if (network === 'mainnet') fail('refusing to create or verify a certificate collection on mainnet (testnet only)');
  let mirrorBase: string;
  try {
    mirrorBase = mirrorBaseFor(network);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
  if (network !== 'testnet') {
    fail(`this script supports testnet only (HEDERA_NETWORK="${network}" — mirror would be ${mirrorBase})`);
  }
  let hashscanBase: string;
  try {
    hashscanBase = hashscanBaseFor(network);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
  if (!operatorId) fail('HEDERA_OPERATOR_ID is not set');
  if (!OPERATOR_ID_RE.test(operatorId)) fail(`HEDERA_OPERATOR_ID "${operatorId}" is not a 0.0.N account id`);
  if (!operatorKey.trim()) fail('HEDERA_OPERATOR_KEY is not set');

  let candidates;
  try {
    candidates = deriveCandidates(operatorKey, keyType);
  } catch (err) {
    fail(`${err instanceof Error ? err.message : err} (key not shown)`);
  }

  // --- run lock: one init:token at a time per target .env ---------------------
  // fail() calls process.exit, which skips finally blocks — the 'exit' hook
  // guarantees the lock is released on every exit path.
  const parentDir = dirname(args.envPath);
  let lock: EnvLock | undefined;
  const takeLock = () => {
    try {
      lock = acquireEnvLock(args.envPath);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    process.on('exit', () => lock?.release());
  };
  if (!existsSync(parentDir)) {
    if (args.dryRun) {
      console.log(`note: ${parentDir} does not exist yet — skipping run lock (dry-run writes nothing)`);
    } else {
      mkdirSync(parentDir, { recursive: true });
      takeLock();
    }
  } else {
    takeLock();
  }

  try {
    await run(args, { operatorId, candidates, network, mirrorBase, hashscanBase });
  } finally {
    lock?.release();
  }
}

async function run(
  args: Args,
  ctx: { operatorId: string; candidates: Awaited<ReturnType<typeof deriveCandidates>>; network: string; mirrorBase: string; hashscanBase: string },
): Promise<void> {
  const { operatorId, candidates, mirrorBase, hashscanBase } = ctx;
  console.log(`operator: ${operatorId}  network: testnet`);
  for (const c of candidates) {
    console.log(`operator pubkey (${c.curve}): sha256:${fingerprint(c.rawHex)}`);
  }

  // --- existing configuration --------------------------------------------------
  const { exists, parsed } = readTargetEnv(args.envPath);
  const dupes = exists ? findDuplicateKeys(parsed, TOKEN_ENV_KEY) : [];
  if (dupes.length > 0) {
    console.log(`warning: duplicate keys in ${args.envPath} (untouched): ${dupes.join(', ')}`);
  }
  const occ = findOccurrences(parsed, TOKEN_ENV_KEY);
  const existing = occ.length > 0 ? occ[occ.length - 1].value : undefined;
  if (occ.length > 1) {
    console.log(`warning: ${occ.length} live occurrences of ${TOKEN_ENV_KEY}; the last is canonical (dotenv last-wins)`);
  }

  // --- idempotency: verify the configured collection instead of creating ------
  if (existing) {
    if (!TOKEN_ID_RE.test(existing)) {
      fail(`${TOKEN_ENV_KEY}="${existing}" is not a 0.0.N token id — fix or unset it, then re-run`);
    }
    console.log(`${TOKEN_ENV_KEY} already set: ${existing} — verifying on the mirror node (no new collection will be created)`);
    let fetched: TokenFetch;
    try {
      fetched = await fetchToken(mirrorBase, existing);
    } catch (err) {
      fail(`mirror node unreachable: ${err instanceof Error ? err.message : err}`);
    }
    if (fetched.status === 404 || !fetched.json) {
      fail(
        `token ${existing} not found on testnet mirror (status ${fetched.status}). ` +
          `Fail closed: unset ${TOKEN_ENV_KEY} if you want a fresh collection, then re-run.`,
      );
    }
    const v = verifyTokenJson(fetched.json, operatorId, candidates);
    for (const n of v.notes) console.log(`note: ${n}`);
    if (!v.ok) {
      for (const f of v.failures) console.log(`mismatch: ${f}`);
      fail(
        `configured collection ${existing} does not match this operator — refusing to overwrite or mint against it. ` +
          `Point ${TOKEN_ENV_KEY} at the right collection, or unset it for a fresh create.`,
      );
    }
    console.log(`OK: ${existing} is a NON_FUNGIBLE_UNIQUE collection with treasury ${operatorId} and a matching supply key.`);
    console.log(`${hashscanBase}/token/${existing}`);
    console.log(`note: verification binds this collection to operator ${operatorId} — the app must mint with the same operator or mint will fail at the supply-key signature step.`);
    console.log('note: this collection may be referenced by other environments too — the finite 100000 supply cap is shared across all of them.');
    console.log('nothing to do.');
    return;
  }

  // --- create path --------------------------------------------------------------
  const plan = [
    'collection plan (mirrors HederaAnchor.createCertificateToken defaults):',
    '  name:            Provenance Certificate',
    '  symbol:          PROVC',
    '  type:            NON_FUNGIBLE_UNIQUE (decimals 0, initial supply 0)',
    '  treasury:        operator account (above)',
    '  supply:          finite, max 100000; supply key = operator public key',
    '  admin/freeze/wipe/kyc keys: none (collection structure immutable; operator can still mint)',
    '  auto-renew:      none configured — no admin key means expiry is FINAL (see --help NOTES)',
    '  memo:            none',
  ];
  const editPlan = exists
    ? `would comment prior live ${TOKEN_ENV_KEY} lines and append "${TOKEN_ENV_KEY}=<new id>" to ${args.envPath}`
    : `would create ${args.envPath} (mode 600) with header comments + "${TOKEN_ENV_KEY}=<new id>"`;

  if (args.dryRun) {
    console.log('dry-run: no on-chain transaction, no file written.');
    for (const l of plan) console.log(l);
    console.log(editPlan);
    return;
  }

  console.log('creating the certificate collection on testnet…');
  const anchor = HederaAnchor.fromEnv();
  if (!anchor) fail('HederaAnchor.fromEnv() returned null despite validated env (unreachable)');
  let tokenId: string;
  try {
    tokenId = await anchor.createCertificateToken();
  } catch (err) {
    try { anchor.close(); } catch { /* ignore */ }
    fail(`collection creation failed: ${err instanceof Error ? err.message : err}`);
  }
  try { anchor.close(); } catch { /* ignore */ }
  console.log(`collection created: ${tokenId}`);
  console.log(`${hashscanBase}/token/${tokenId}`);

  // Mirror lags behind consensus — poll before verifying.
  console.log('waiting for the collection to appear on the mirror node…');
  const seen = await pollForToken((id) => fetchToken(mirrorBase, id), tokenId, MIRROR_POLL_ATTEMPTS, MIRROR_POLL_DELAY_MS);
  if (seen.json) {
    const v = verifyTokenJson(seen.json, operatorId, candidates);
    for (const n of v.notes) console.log(`note: ${n}`);
    if (v.ok) {
      console.log(`mirror-verified (${seen.attemptsUsed} attempt(s)): ${tokenId} matches this operator.`);
    } else {
      for (const f of v.failures) console.log(`mirror warning: ${f}`);
      console.log(
        'warning: the just-created collection failed mirror verification — writing the id anyway ' +
          '(the creation receipt is the source of truth). Investigate before use.',
      );
    }
  } else {
    console.log(
      `warning: collection ${tokenId} not visible on the mirror after ${seen.attemptsUsed} attempts (mirror lag) — ` +
        'id written; re-run to verify.',
    );
  }

  const baseLines = exists ? parsed.lines : ['# Created by init:token — operator credentials live in process env, never here.', '# Do not commit this file with real values.'];
  const upd = setEnvValue(baseLines, TOKEN_ENV_KEY, tokenId);
  writeTargetEnv(args.envPath, upd.lines, !exists);
  if (upd.diff) {
    console.log('--- .env change ---');
    console.log(upd.diff);
  }
  console.log(
    `${TOKEN_ENV_KEY}=${tokenId} written to ${args.envPath} (${upd.action}` +
      (upd.superseded.length > 0 ? `, ${upd.superseded.length} prior line(s) commented, never deleted` : '') +
      ')',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`init:token: ERROR: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
