'use client';

import type { OracleEvidence } from '../lib/types';

/**
 * The committed oracle evidence for a value-bearing claim: which feed, which
 * round, what answer. Everything shown here is bound into the receipt's
 * taskHash — a stranger can re-read the same round via getRoundData and
 * confirm the evidence was honest.
 */
export default function OracleEvidencePanel({ evidence }: { evidence: OracleEvidence }) {
  return (
    <div className="card">
      <h2>Oracle evidence</h2>
      <p className="sub">
        Committed at attestation time and bound into the receipt. Re-checkable against the feed
        contract via <code>getRoundData(roundId)</code>.
      </p>
      {evidence.readings.map((r, i) => (
        <div className="rowitem" key={i}>
          <div className="rowhead">
            <span>
              {r.pair} <span className="spec">{r.mode}</span>
            </span>
          </div>
          <ul className="findings">
            <li>
              feed <code>{r.feedAddress}</code>
            </li>
            <li>
              round <code>{r.roundId}</code> (answeredInRound {r.answeredInRound})
            </li>
            <li>
              answer <code>{r.answer}</code> ({r.decimals}dp) · updatedAt {r.updatedAt}
            </li>
          </ul>
        </div>
      ))}
      <p className="sub" style={{ marginTop: '0.5rem' }}>
        compositeUsdCents <code>{evidence.compositeUsdCents}</code> · computedAt{' '}
        {evidence.computedAt}
      </p>
    </div>
  );
}
