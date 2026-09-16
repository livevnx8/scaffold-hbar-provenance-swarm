'use client';

import { useState } from 'react';

export default function VerifyOnChain() {
  const [claimId, setClaimId] = useState('');
  const [decisionHash, setDecisionHash] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    match: boolean;
    anchoredAt?: string;
    anchoredBy?: string;
    error?: string;
  } | null>(null);

  async function check() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/contract-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, decisionHash }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ match: false, error: 'Network error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Check a receipt against the chain</h2>
      <p className="sub">
        The third-party story: someone hands you a claim ID and a decision hash. Look it up in the{' '}
        <code style={{ fontFamily: 'var(--mono)' }}>ProvenanceRegistry</code> contract — if the hash
        matches, the receipt is exactly what was anchored. No trust in the verifier required.
      </p>

      <div className="grid2">
        <div className="field">
          <label>Claim ID</label>
          <input value={claimId} onChange={(e) => setClaimId(e.target.value)} placeholder="claim-cof-042" />
        </div>
        <div className="field">
          <label>Decision hash</label>
          <input value={decisionHash} onChange={(e) => setDecisionHash(e.target.value)} placeholder="64-char hex" />
        </div>
      </div>

      <div className="btnrow" style={{ marginTop: 0 }}>
        <button className="btn" onClick={check} disabled={busy || !claimId || !decisionHash}>
          {busy ? (
            <>
              <span className="spin" /> Checking…
            </>
          ) : (
            'Verify on-chain →'
          )}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: '1rem' }}>
          {result.error ? (
            <div className="notice error">{result.error}</div>
          ) : (
            <div className={`verdict-banner ${result.match ? 'verified' : 'rejected'}`}>
              <span style={{ fontSize: '1.6rem' }}>{result.match ? '✓' : '✕'}</span>
              <div>
                {result.match ? 'Receipt matches the on-chain anchor' : 'No match — this receipt was not anchored as presented'}
                {result.match && result.anchoredAt && (
                  <small>
                    anchored {result.anchoredAt} by {result.anchoredBy}
                  </small>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}