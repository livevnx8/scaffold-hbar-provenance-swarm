/**
 * tamperUsdEquivalent: the ClaimForm "Tamper value" button inflates the
 * declared USD-cents field 100x. The field is free text, so the handler must
 * never throw on non-numeric input ("abc", "1.5", "12e3") — BigInt() would
 * raise a SyntaxError inside the React onClick handler. Garbage falls back
 * to the default tampered value; the server 400s it anyway.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tamperUsdEquivalent } from './tamper.js';

describe('tamperUsdEquivalent', () => {
  test('numeric strings inflate exactly 100x', () => {
    assert.equal(tamperUsdEquivalent('120000'), '12000000');
    assert.equal(tamperUsdEquivalent('1'), '100');
    assert.equal(tamperUsdEquivalent('0'), '0');
  });

  test('non-numeric input falls back instead of throwing', () => {
    assert.equal(tamperUsdEquivalent('abc'), '12000000');
    assert.equal(tamperUsdEquivalent('1.5'), '12000000');
    assert.equal(tamperUsdEquivalent('12e3'), '12000000');
    assert.equal(tamperUsdEquivalent(' 1200 '), '12000000');
    assert.equal(tamperUsdEquivalent('-5'), '12000000');
    assert.equal(tamperUsdEquivalent('0x10'), '12000000');
  });

  test('empty/undefined falls back', () => {
    assert.equal(tamperUsdEquivalent(''), '12000000');
    assert.equal(tamperUsdEquivalent(undefined), '12000000');
  });
});
