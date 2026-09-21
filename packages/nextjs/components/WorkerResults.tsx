'use client';

import { useEffect, useState } from 'react';
import type { WorkerVerdict } from '../lib/types';

export default function WorkerResults({ results }: { results: WorkerVerdict[] }) {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    setVisible(0);
    const t = setInterval(() => {
      setVisible((v) => {
        if (v >= results.length) {
          clearInterval(t);
          return v;
        }
        return v + 1;
      });
    }, 450);
    return () => clearInterval(t);
  }, [results]);

  return (
    <div className="card">
      <h2>2 · Swarm verdicts</h2>
      <p className="sub">
        Each verifier worker checks one dimension of the claim. All logic is deterministic, so the same
        claim always produces the same verdicts.
      </p>
      {results.slice(0, visible).map((r) => (
        <div className="worker" key={r.workerId}>
          <div className="whead">
            <div>
              <span className="wname">{r.name}</span>
              <span className="spec">{r.specialty}</span>
            </div>
            <span className={`badge ${r.passed ? 'pass' : 'fail'}`}>
              {r.passed ? 'Pass' : 'Fail'}
            </span>
          </div>
          <div className="confbar">
            <div style={{ width: `${Math.round(r.confidence * 100)}%` }} />
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            confidence {(r.confidence * 100).toFixed(0)}%
          </div>
          <ul className="findings">
            {r.findings.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      ))}
      {visible < results.length && (
        <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          <span className="spin" /> Running verifiers…
        </div>
      )}
    </div>
  );
}