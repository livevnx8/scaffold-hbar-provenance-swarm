/**
 * "Tamper value" demo helper (ClaimForm): inflate a declared USD-cents
 * string 100x so the value worker must refuse.
 *
 * The form field is free text, so the current value can be anything
 * ("abc", "1.5", "12e3", ...). BigInt() throws a SyntaxError on those, and
 * an uncaught throw inside the React onClick handler kills the click with
 * a console error. Non-numeric input therefore falls back to the default
 * tampered value instead of throwing — the demo stays clickable and the
 * server would 400 such input anyway.
 */
export function tamperUsdEquivalent(current: string | undefined): string {
  if (current && /^[0-9]+$/.test(current)) {
    return (BigInt(current) * BigInt(100)).toString();
  }
  return '12000000';
}
