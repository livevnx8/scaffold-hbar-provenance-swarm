/**
 * Unit tests for lib.ts — pure functions only, no network, no keys on disk.
 * Throwaway keys are generated in-memory per run and never funded or used.
 *
 * Run: node_modules/.bin/tsx unit-tests.ts
 */
import { PrivateKey } from '@hashgraph/sdk';
import {
  parseEnvFile,
  findOccurrences,
  findDuplicateKeys,
  unquoteEnvValue,
  setEnvValue,
  diffEnvLines,
  checkSupplyKey,
  checkProtobufKey,
  extractKeyMaterial,
  verifyTokenJson,
  deriveCandidates,
  pollForToken,
  mirrorBaseFor,
  acquireEnvLock,
  shouldWarnChmod,
  LOW_SUPPLY_WARN_FRACTION,
  type PubCandidate,
  type KeyMaterial,
} from './lib.js';

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, extra = ''): void {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`);
  }
}

function pubOf(k: PrivateKey, curve: 'ed25519' | 'ecdsa'): PubCandidate {
  return { curve, rawHex: Buffer.from(k.publicKey.toBytesRaw()).toString('hex') };
}

// --- env parsing ------------------------------------------------------------
console.log('env parsing');
{
  const text = '# comment\nHEDERA_NETWORK=testnet\nexport FOO="bar baz"\nEMPTY=\n# HEDERA_NETWORK=mainnet\n';
  const p = parseEnvFile(text);
  ok('finds NETWORK', findOccurrences(p, 'HEDERA_NETWORK')[0]?.value === 'testnet');
  ok('export prefix + quotes stripped', findOccurrences(p, 'FOO')[0]?.value === 'bar baz');
  ok('empty value', findOccurrences(p, 'EMPTY')[0]?.value === '');
  ok('commented line ignored', findOccurrences(p, 'HEDERA_NETWORK').length === 1);
  ok('unquote single', unquoteEnvValue("  'x y' ") === 'x y');
  ok('unquote none', unquoteEnvValue('abc') === 'abc');
}

// --- setEnvValue: Grok claim 8 — lines are NEVER deleted -----------------------
console.log('setEnvValue (comment-not-delete)');
{
  const lines = '# c1\nA=1\nB=2\n# c2\n'.split('\n');
  const r = setEnvValue(lines, 'HEDERA_CERTIFICATE_TOKEN_ID', '0.0.42');
  ok('add appends', r.action === 'added' && r.lines[r.lines.length - 1] === 'HEDERA_CERTIFICATE_TOKEN_ID=0.0.42');
  ok('comments preserved', r.lines[0] === '# c1' && r.lines[3] === '# c2');
  ok('add diff shows +', r.diff.includes('+ HEDERA_CERTIFICATE_TOKEN_ID=0.0.42'));

  const lines2 = ['A=1', 'HEDERA_CERTIFICATE_TOKEN_ID=0.0.9', 'B=2'];
  const r2 = setEnvValue(lines2, 'HEDERA_CERTIFICATE_TOKEN_ID', '0.0.42');
  ok('single different -> commented + appended', r2.action === 'superseded');
  ok('old line commented not deleted', r2.lines.includes('# superseded by init:token: HEDERA_CERTIFICATE_TOKEN_ID=0.0.9'));
  ok('canonical line appended', r2.lines[r2.lines.length - 1] === 'HEDERA_CERTIFICATE_TOKEN_ID=0.0.42');
  ok('exactly one live assignment', findOccurrences(parseEnvFile(r2.lines.join('\n')), 'HEDERA_CERTIFICATE_TOKEN_ID').length === 1);
  ok('diff shows - and +', r2.diff.includes('- HEDERA_CERTIFICATE_TOKEN_ID=0.0.9') && r2.diff.includes('+ HEDERA_CERTIFICATE_TOKEN_ID=0.0.42'));
  ok('original line preserved in diff context', r2.diff.includes('# superseded by init:token:'));

  const lines3 = ['HEDERA_CERTIFICATE_TOKEN_ID=0.0.1', 'A=1', 'HEDERA_CERTIFICATE_TOKEN_ID=0.0.2'];
  const r3 = setEnvValue(lines3, 'HEDERA_CERTIFICATE_TOKEN_ID', '0.0.42');
  const live3 = findOccurrences(parseEnvFile(r3.lines.join('\n')), 'HEDERA_CERTIFICATE_TOKEN_ID');
  ok('dupes: all prior commented', r3.action === 'superseded' && r3.superseded.length === 2);
  ok('dupes: one live canonical line', live3.length === 1 && live3[0].value === '0.0.42');
  ok('dupes: nothing deleted, line count grew', r3.lines.length === 4);
  ok('dupes: A=1 untouched', r3.lines.includes('A=1'));

  const lines3b = ['HEDERA_CERTIFICATE_TOKEN_ID=0.0.1', 'A=1', 'HEDERA_CERTIFICATE_TOKEN_ID=0.0.42'];
  const r3b = setEnvValue(lines3b, 'HEDERA_CERTIFICATE_TOKEN_ID', '0.0.42');
  const live3b = findOccurrences(parseEnvFile(r3b.lines.join('\n')), 'HEDERA_CERTIFICATE_TOKEN_ID');
  ok('last already canonical -> only earlier commented', r3b.action === 'superseded' && live3b.length === 1 && live3b[0].value === '0.0.42' && r3b.superseded.length === 1);

  const lines4 = ['HEDERA_CERTIFICATE_TOKEN_ID=0.0.42'];
  const r4 = setEnvValue(lines4, 'HEDERA_CERTIFICATE_TOKEN_ID', '0.0.42');
  ok('noop when identical', r4.action === 'noop-same' && r4.diff === '');

  const lines5 = ['HEDERA_CERTIFICATE_TOKEN_ID="0.0.42"'];
  const r5 = setEnvValue(lines5, 'HEDERA_CERTIFICATE_TOKEN_ID', '0.0.42');
  ok('noop when quoted-identical (no churn)', r5.action === 'noop-same');

  const dup = parseEnvFile('X=1\nY=2\nX=3\n');
  ok('duplicateKeys reports X', findDuplicateKeys(dup).join(',') === 'X');
  ok('duplicateKeys except skips', findDuplicateKeys(dup, 'X').length === 0);
}

// --- diffEnvLines --------------------------------------------------------------
console.log('diffEnvLines');
{
  const d1 = diffEnvLines(['A=1'], ['A=1', 'B=2']);
  ok('append shows +', d1.includes('+ B=2') && !d1.includes('\n- '));
  const d2 = diffEnvLines(['A=1', 'B=9'], ['A=1', 'B=2']);
  ok('replace shows - and +', d2.includes('- B=9') && d2.includes('+ B=2'));
  ok('identical -> empty', diffEnvLines(['A=1'], ['A=1']) === '');
  const big = Array.from({ length: 30 }, (_, i) => `K${i}=v`);
  const big2 = [...big]; big2[15] = 'K15=changed';
  const d3 = diffEnvLines(big, big2);
  ok('long runs collapse', d3.includes('...') && d3.includes('- K15=v') && d3.includes('+ K15=changed') && !d3.includes('K0=v'));
}

// --- supply key checks ---------------------------------------------------------
console.log('supply key checks');
{
  const ed = PrivateKey.generateED25519();
  const ec = PrivateKey.generateECDSA();
  const edC = pubOf(ed, 'ed25519');
  const ecC = pubOf(ec, 'ecdsa');

  ok('ED25519 match', checkSupplyKey({ _type: 'ED25519', key: edC.rawHex }, [edC]).check === 'match');
  ok('ED25519 mismatch bytes', checkSupplyKey({ _type: 'ED25519', key: '00'.repeat(32) }, [edC]).check === 'mismatch');
  ok('ED25519 vs ecdsa operator', checkSupplyKey({ _type: 'ED25519', key: edC.rawHex }, [ecC]).check === 'mismatch');
  ok('ECDSA_SECP256K1 match', checkSupplyKey({ _type: 'ECDSA_SECP256K1', key: ecC.rawHex }, [ecC]).check === 'match');
  // Real mirror fixture from testnet token 0.0.10649238 (read-only data) vs a throwaway key:
  const realHex = '02eb00de361967af221c1baa544d5616938d569b44156238cfbb91bb0beb3402fb';
  ok('real mirror key vs wrong operator -> mismatch', checkSupplyKey({ _type: 'ECDSA_SECP256K1', key: realHex }, [ecC]).check === 'mismatch');
  ok('missing supply_key -> indeterminate', checkSupplyKey(null, [edC]).check === 'indeterminate');
  ok('unknown _type -> indeterminate', checkSupplyKey({ _type: 'BLS', key: 'aa' }, [edC]).check === 'indeterminate');

  // ProtobufEncoded: synthetic bare ed25519 key
  const protoEd = '12' + '20' + edC.rawHex;
  ok('protobuf ed25519 match', checkProtobufKey(protoEd, [edC]).check === 'match');
  const protoEc = '3a' + '21' + ecC.rawHex;
  ok('protobuf ecdsa match', checkProtobufKey(protoEc, [ecC]).check === 'match');
  ok('protobuf wrong bytes -> mismatch', checkProtobufKey('12' + '20' + 'ff'.repeat(32), [edC]).check === 'mismatch');
  ok('protobuf keylist tag -> indeterminate', checkProtobufKey('32' + '04' + 'deadbeef', [edC]).check === 'indeterminate');
  ok('protobuf truncated -> indeterminate', checkProtobufKey('12', [edC]).check === 'indeterminate');
}

// --- verifyTokenJson -------------------------------------------------------------
console.log('verifyTokenJson');
{
  const ec = PrivateKey.generateECDSA();
  const ecC = pubOf(ec, 'ecdsa');
  const good = {
    deleted: false,
    type: 'NON_FUNGIBLE_UNIQUE',
    treasury_account_id: '0.0.777',
    supply_key: { _type: 'ECDSA_SECP256K1', key: ecC.rawHex },
    name: 'Provenance Certificate',
    symbol: 'PROVC',
  };
  const v = verifyTokenJson(good, '0.0.777', [ecC]);
  ok('full match ok', v.ok && v.failures.length === 0);

  const wrongTreasury = { ...good, treasury_account_id: '0.0.778' };
  ok('treasury mismatch fails', !verifyTokenJson(wrongTreasury, '0.0.777', [ecC]).ok);

  const fungible = { ...good, type: 'FUNGIBLE_COMMON' };
  ok('fungible type fails', !verifyTokenJson(fungible, '0.0.777', [ecC]).ok);

  const deleted = { ...good, deleted: true };
  ok('deleted fails', !verifyTokenJson(deleted, '0.0.777', [ecC]).ok);

  const badKey = { ...good, supply_key: { _type: 'ECDSA_SECP256K1', key: '02' + '11'.repeat(32) } };
  ok('supply key mismatch fails', !verifyTokenJson(badKey, '0.0.777', [ecC]).ok);

  const renamed = { ...good, name: 'Something Else', symbol: 'ELSE' };
  const vr = verifyTokenJson(renamed, '0.0.777', [ecC]);
  ok('name drift is note not failure', vr.ok && vr.notes.some((n) => n.includes('differ')));
}

// --- deriveCandidates ------------------------------------------------------------
console.log('deriveCandidates');
{
  const ed = PrivateKey.generateED25519();
  const ec = PrivateKey.generateECDSA();
  const rawEd = ed.toStringRaw();
  const rawEc = ec.toStringRaw();
  const derEd = ed.toStringDer();
  const derEc = ec.toStringDer();

  const c1 = deriveCandidates(rawEd, 'ed25519');
  ok('typed ed25519 -> one ed candidate', c1.length === 1 && c1[0].curve === 'ed25519');

  const c2 = deriveCandidates(rawEc, 'ecdsa');
  ok('typed ecdsa -> one ecdsa candidate', c2.length === 1 && c2[0].curve === 'ecdsa');

  const c3 = deriveCandidates(derEd);
  ok('DER ed25519 auto -> ed candidate', c3.some((c) => c.curve === 'ed25519'));

  const c4 = deriveCandidates(derEc);
  ok('DER ecdsa auto -> ecdsa candidate', c4.some((c) => c.curve === 'ecdsa'));

  const c5 = deriveCandidates('0x' + rawEc);
  ok('0x prefix tolerated', c5.length >= 1);

  let threw2 = false;
  try {
    deriveCandidates(rawEd, 'sr25519');
  } catch {
    threw2 = true;
  }
  ok('bad keyType throws', threw2);

  let threw3 = false;
  try {
    deriveCandidates('not-hex!!');
  } catch {
    threw3 = true;
  }
  ok('non-hex throws', threw3);
}

// --- Grok claim 3: supply lifecycle -------------------------------------------
console.log('supply lifecycle (pause / cap / kyc / admin / expiry)');
{
  const ec = PrivateKey.generateECDSA();
  const ecC = pubOf(ec, 'ecdsa');
  const base = {
    deleted: false,
    type: 'NON_FUNGIBLE_UNIQUE',
    treasury_account_id: '0.0.777',
    supply_key: { _type: 'ECDSA_SECP256K1', key: ecC.rawHex },
    supply_type: 'FINITE',
    max_supply: '100000',
    total_supply: '3',
    pause_status: 'UNPAUSED',
    name: 'Provenance Certificate',
    symbol: 'PROVC',
  };
  ok('healthy finite token ok', verifyTokenJson(base, '0.0.777', [ecC]).ok);

  const paused = { ...base, pause_status: 'PAUSED' };
  const vp = verifyTokenJson(paused, '0.0.777', [ecC]);
  ok('PAUSED fails', !vp.ok && vp.failures.some((f) => f.includes('PAUSED')));

  const badPause = { ...base, pause_status: 'SOMEWHAT_PAUSED' };
  ok('unrecognized pause_status fails closed', !verifyTokenJson(badPause, '0.0.777', [ecC]).ok);

  const exhausted = { ...base, total_supply: '100000' };
  const vex = verifyTokenJson(exhausted, '0.0.777', [ecC]);
  ok('exhausted cap fails', !vex.ok && vex.failures.some((f) => f.includes('exhausted')));

  const low = { ...base, total_supply: String(100000 - Math.floor(100000 * LOW_SUPPLY_WARN_FRACTION) + 1) };
  const vl = verifyTokenJson(low, '0.0.777', [ecC]);
  ok('low supply warns but passes', vl.ok && vl.notes.some((n) => n.includes('low remaining supply')));

  const unreadable = { ...base, max_supply: 'many' };
  ok('unreadable max_supply fails closed', !verifyTokenJson(unreadable, '0.0.777', [ecC]).ok);

  const kyc = { ...base, kyc_key: { _type: 'ED25519', key: '00'.repeat(32) } };
  ok('kyc_key present fails', !verifyTokenJson(kyc, '0.0.777', [ecC]).ok);

  const adm = { ...base, admin_key: { _type: 'ED25519', key: '00'.repeat(32) } };
  const va = verifyTokenJson(adm, '0.0.777', [ecC]);
  ok('admin_key present fails (TOCTOU)', !va.ok && va.failures.some((f) => f.includes('TOCTOU')));

  const exp = { ...base, expiry_timestamp: '1790000000.000000000' };
  const ve = verifyTokenJson(exp, '0.0.777', [ecC]);
  ok('expiry_timestamp warns, does not fail', ve.ok && ve.notes.some((n) => n.includes('expires at')));

  const noRenew = verifyTokenJson(base, '0.0.777', [ecC]);
  ok('no auto_renew_account + no admin -> finality note', noRenew.notes.some((n) => n.includes('expiry is final')));
}

// --- Grok claim 9: complex key shapes -------------------------------------------
console.log('complex key shapes');
{
  // tiny protobuf encoders for fixtures
  const varint = (n: number): Buffer => {
    const out: number[] = [];
    let v = n;
    do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; out.push(b); } while (v);
    return Buffer.from(out);
  };
  const ld = (fieldNo: number, payload: Buffer): Buffer =>
    Buffer.concat([varint((fieldNo << 3) | 2), varint(payload.length), payload]);
  const vi = (fieldNo: number, n: number): Buffer =>
    Buffer.concat([varint((fieldNo << 3) | 0), varint(n)]);
  const keyMsg = (curve: 'ed25519' | 'ecdsa', rawHex: string): Buffer =>
    ld(curve === 'ed25519' ? 2 : 7, Buffer.from(rawHex, 'hex'));
  const keyListMsg = (keys: Buffer[]): Buffer =>
    ld(6, Buffer.concat(keys.map((k) => ld(1, k))));
  const thresholdMsg = (threshold: number, keys: Buffer[]): Buffer =>
    ld(5, Buffer.concat([vi(1, threshold), ld(2, Buffer.concat(keys.map((k) => ld(1, k))))]));

  const ed = PrivateKey.generateED25519();
  const ec = PrivateKey.generateECDSA();
  const edC = pubOf(ed, 'ed25519');
  const ecC = pubOf(ec, 'ecdsa');

  // one-element KeyList wrapping the operator key -> match
  const kl1 = keyListMsg([keyMsg('ecdsa', ecC.rawHex)]).toString('hex');
  ok('one-element KeyList matches', checkSupplyKey({ _type: 'ProtobufEncoded', key: kl1 }, [ecC]).check === 'match');

  // two-element KeyList -> fail closed (indeterminate)
  const kl2 = keyListMsg([keyMsg('ecdsa', ecC.rawHex), keyMsg('ed25519', edC.rawHex)]).toString('hex');
  ok('two-element KeyList fails closed', checkSupplyKey({ _type: 'ProtobufEncoded', key: kl2 }, [ecC]).check === 'indeterminate');

  // threshold-1 ThresholdKey with one key -> match
  const th1 = thresholdMsg(1, [keyMsg('ecdsa', ecC.rawHex)]).toString('hex');
  ok('threshold-1 ThresholdKey matches', checkSupplyKey({ _type: 'ProtobufEncoded', key: th1 }, [ecC]).check === 'match');

  // threshold-2 -> fail closed
  const th2 = thresholdMsg(2, [keyMsg('ecdsa', ecC.rawHex)]).toString('hex');
  ok('threshold-2 fails closed', checkSupplyKey({ _type: 'ProtobufEncoded', key: th2 }, [ecC]).check === 'indeterminate');

  // contract key (field 1) -> fail closed
  const ck = ld(1, Buffer.from('010203', 'hex')).toString('hex');
  ok('contract key fails closed', checkSupplyKey({ _type: 'ProtobufEncoded', key: ck }, [ecC]).check === 'indeterminate');

  // empty key bytes -> fail closed
  ok('empty key fails closed', checkSupplyKey({ _type: 'ProtobufEncoded', key: '' }, [ecC]).check === 'indeterminate');

  // RSA_3072 field -> fail closed
  const rsa = ld(3, Buffer.alloc(384, 1)).toString('hex');
  ok('RSA field fails closed', checkSupplyKey({ _type: 'ProtobufEncoded', key: rsa }, [ecC]).check === 'indeterminate');

  // Grok claim 6: typed comparison — ecdsa bytes presented as ED25519 must NOT
  // match an ecdsa-only operator (bytes alone are not enough).
  ok(
    'cross-curve bytes do not false-match',
    checkSupplyKey({ _type: 'ED25519', key: ecC.rawHex.slice(0, 64) }, [ecC]).check === 'mismatch',
  );

  // Grok vector 6: protobuf-wrapped vs raw normalize to the same material.
  const mRaw = extractKeyMaterial({ _type: 'ED25519', key: edC.rawHex });
  const mProto = extractKeyMaterial({ _type: 'ProtobufEncoded', key: '12' + '20' + edC.rawHex });
  ok(
    'normalization: raw and protobuf-wrapped agree',
    mRaw.ok && mProto.ok &&
      mRaw.material.curve === mProto.material.curve &&
      mRaw.material.rawHex === mProto.material.rawHex,
  );
}

// --- Grok vector 2: mirror polling ------------------------------------------------
console.log('pollForToken');
{
  const good = { status: 200, json: { token_id: '0.0.1' } };
  let calls = 0;
  const flaky = async () => { calls++; return calls < 3 ? { status: 404, json: null } : good; };
  const r1 = await pollForToken(flaky, '0.0.1', 6, 0, async () => {});
  ok('retries past 404s', r1.json !== null && r1.attemptsUsed === 3);

  const always404 = async () => ({ status: 404, json: null });
  const r2 = await pollForToken(always404, '0.0.1', 4, 0, async () => {});
  ok('gives up after N attempts', r2.json === null && r2.attemptsUsed === 4);

  let errThenOk = 0;
  const erry = async () => { errThenOk++; if (errThenOk === 1) throw new Error('boom'); return good; };
  const r3 = await pollForToken(erry, '0.0.1', 3, 0, async () => {});
  ok('network error retried, not fatal', r3.json !== null && r3.attemptsUsed === 2);
}

// --- Grok vector 3: network -> mirror mapping --------------------------------------
console.log('network mapping');
{
  ok('testnet mirror base', mirrorBaseFor('testnet') === 'https://testnet.mirrornode.hedera.com/api/v1');
  let threw = false;
  try { mirrorBaseFor('bogusnet'); } catch { threw = true; }
  ok('unknown network throws', threw);
}

// --- Grok vector 4: run locking ------------------------------------------------------
console.log('run locking');
{
  const { mkdtempSync, existsSync: ex } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'locktest-'));
  const envPath = join(dir, '.env');
  const l1 = acquireEnvLock(envPath);
  ok('lock file created', ex(envPath + '.init-token.lock'));
  let threw2 = false;
  try { acquireEnvLock(envPath); } catch (e) { threw2 = (e as Error).message.includes('holds the lock'); }
  ok('second acquire refuses', threw2);
  l1.release();
  ok('release removes lock', !ex(envPath + '.init-token.lock'));
  l1.release();
  ok('double release harmless', true);
  const l2 = acquireEnvLock(envPath);
  ok('re-acquire after release', ex(envPath + '.init-token.lock'));
  l2.release();
}

// --- Grok vector 5: chmod warning flag -------------------------------------------------
console.log('chmod platform flag');
{
  ok('returns a boolean', typeof shouldWarnChmod() === 'boolean');
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);