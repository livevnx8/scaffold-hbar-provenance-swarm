'use client';

import type { ProvenanceReceipt, DoubleVerifierReport } from '../lib/types';
import Hash from './Hash';

const PASS_A = ['task_hash', 'decision_hash'];
const PASS_B = ['verdict_consistency', 'worker_quorum'];

export default function ReceiptCard({
  receipt,
  report,
}: {
  receipt: ProvenanceReceipt;
  report: DoubleVerifierReport;
}) {
  const verdictClass =
    receipt.verdict === 'verified'
      ? 'verified'
      : receipt.verdict === 'needs_review'
        ? 'needs_review'
        : 'rejected';

  const verdictLabel =
    receipt.verdict === 'verified'
      ? 'Verified'
      : receipt.verdict === 'needs_review'
        ? 'Needs review'
        : 'Rejected';

  const checksFor = (names: string[]) =>
    names.map((n) => report.checks.find((c) => c.name === n)).filter(Boolean);

  return (
    <div className="card">
      <h2>3 · Tamper-evident receipt</h2>
      <p className="sub">
        The coordinator binds the claim and worker verdicts into a receipt. The double-verifier then
        re-checks it in two check groups (hash integrity, policy) that must both pass.
      </p>

      <div className={`verdict-banner ${verdictClass}`}>
        <span style={{ fontSize: '1.6rem' }}>
          {receipt.verdict === 'verified' ? '✓' : receipt.verdict === 'needs_review' ? '!' : '✕'}
        </span>
        <div>
          {verdictLabel}
          <small>
            {report.summary}
          </small>
          {receipt.verdict === 'needs_review' && report.verdict === 'accepted' && (
            <small style={{ display: 'block', marginTop: '0.35rem' }}>
              Double-verifier &quot;accepted&quot; here means the receipt is authentic and
              truthfully records <code>needs_review</code>: not that the claim itself is verified.
            </small>
          )}
        </div>
      </div>

      <Hash label="taskHash: sha256(canonical claim)" value={receipt.taskHash} />
      <Hash label="decisionHash: sha256(taskHash + worker results)" value={receipt.decisionHash} />

      <div className="kv" style={{ marginTop: '0.75rem' }}>
        <span className="k">Claim ID</span>
        <code style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem' }}>{receipt.claimId}</code>
      </div>
      <div className="kv">
        <span className="k">Issued</span>
        <span>{new Date(receipt.timestamp).toLocaleString()}</span>
      </div>

      <div className="passgrid">
        <div className="passbox">
          <h3>
            Pass A: hash integrity{' '}
            <span className={`badge ${PASS_A.every((n) => report.checks.find((c) => c.name === n)?.ok) ? 'pass' : 'fail'}`}>
              {PASS_A.every((n) => report.checks.find((c) => c.name === n)?.ok) ? 'ok' : 'failed'}
            </span>
          </h3>
          {checksFor(PASS_A).map((c) => (
            <div className="checkline" key={c!.name}>
              <span className={c!.ok ? 'ok' : 'no'}>{c!.ok ? '✓' : '✕'}</span>
              <span>
                <strong>{c!.name}</strong>: {c!.detail}
              </span>
            </div>
          ))}
        </div>
        <div className="passbox">
          <h3>
            Pass B: policy{' '}
            <span className={`badge ${PASS_B.every((n) => report.checks.find((c) => c.name === n)?.ok) ? 'pass' : 'fail'}`}>
              {PASS_B.every((n) => report.checks.find((c) => c.name === n)?.ok) ? 'ok' : 'failed'}
            </span>
          </h3>
          {checksFor(PASS_B).map((c) => (
            <div className="checkline" key={c!.name}>
              <span className={c!.ok ? 'ok' : 'no'}>{c!.ok ? '✓' : '✕'}</span>
              <span>
                <strong>{c!.name}</strong>: {c!.detail}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}