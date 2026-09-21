'use client';

import { useEffect, useState } from 'react';
import ClaimForm from '../components/ClaimForm';
import WorkerResults from '../components/WorkerResults';
import ReceiptCard from '../components/ReceiptCard';
import AnchorPanel from '../components/AnchorPanel';
import VerifyOnChain from '../components/VerifyOnChain';
import type { ProvenanceClaim, ProvenanceReceipt, DoubleVerifierReport, ChainConfig } from '../lib/types';

type Tab = 'verify' | 'check';

export default function Home() {
  const [tab, setTab] = useState<Tab>('verify');
  const [config, setConfig] = useState<ChainConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState(0);
  const [claim, setClaim] = useState<ProvenanceClaim | null>(null);
  const [receipt, setReceipt] = useState<ProvenanceReceipt | null>(null);
  const [report, setReport] = useState<DoubleVerifierReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  async function verify(nextClaim: ProvenanceClaim) {
    setBusy(true);
    setError(null);
    setReceipt(null);
    setReport(null);
    setClaim(nextClaim);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextClaim),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Verification failed');
      } else {
        setReceipt(data.receipt);
        setReport(data.report);
        setRunId((n) => n + 1);
      }
    } catch {
      setError('Network error while verifying');
    } finally {
      setBusy(false);
    }
  }

  // Claim(0) → Verify(1, busy) → Receipt(2) → Anchor(3 current once receipt exists)
  const stage = busy ? 1 : !receipt ? 0 : 3;

  return (
    <div className="container">
      <header className="hero">
        <div className={`netbadge ${config?.hedera ? 'live' : ''}`}>
          <span className="dot" />
          {config ? (config.hedera ? `Hedera ${config.network} configured` : 'Offline demo mode') : '…'}
        </div>
        <h1>
          <span className="brand">Provenance</span> Swarm
        </h1>
        <p>
          <strong>Why it matters.</strong> Supply-chain claims are easy to forge and hard to re-check.
          This template turns a product claim into a tamper-evident receipt: a deterministic swarm
          verifies origin, custody, and documents, binds the verdicts into the receipt with
          cryptographic hashes, and can anchor it on Hedera, so a stranger can check a presented
          receipt against the chain without trusting the original verifier.
        </p>
        <p className="sub" style={{ marginTop: '0.75rem' }}>
          Offline path: load the coffee fixture, run verification (GREEN), then use{' '}
          <strong>Tamper attestation</strong> and re-run to see a refused claim (RED) explain itself.
          CLI twin: <code style={{ fontFamily: 'var(--mono)' }}>npm run demo</code> (~30s after install;
          first <code style={{ fontFamily: 'var(--mono)' }}>npm install</code> can take ~9 minutes).
        </p>
      </header>

      <div className="tabs">
        <button className={tab === 'verify' ? 'active' : ''} onClick={() => setTab('verify')}>
          Verify a claim
        </button>
        <button className={tab === 'check' ? 'active' : ''} onClick={() => setTab('check')}>
          Check a receipt
        </button>
      </div>

      {tab === 'verify' ? (
        <>
          <div className="stepper">
            {['Claim', 'Verify', 'Receipt', 'Anchor'].map((label, i) => (
              <div
                key={label}
                className={`step ${i < stage ? 'done' : i === stage ? 'current' : ''}`}
              >
                {i + 1} · {label}
              </div>
            ))}
          </div>

          <ClaimForm onVerify={verify} busy={busy} />

          {error && <div className="notice error">{error}</div>}

          {receipt && report && (
            <>
              <WorkerResults key={`w-${runId}`} results={receipt.results} />
              <ReceiptCard receipt={receipt} report={report} />
              <AnchorPanel key={`a-${runId}`} receipt={receipt} claim={claim} />
            </>
          )}
        </>
      ) : (
        <VerifyOnChain />
      )}

      <footer className="foot">
        <div>
          <strong>For developers.</strong> Scaffold your own from this template:
        </div>
        <code>npm exec --yes create-scaffold-hbar@latest -- --template livevnx8/scaffold-hbar-provenance-swarm --solidity-framework hardhat --package-manager npm</code>
        <div style={{ marginTop: '0.75rem' }}>
          Offline verification runs with no Hedera account. Anchoring, the registry contract, and
          certificate mints need testnet credentials in <code>packages/nextjs/.env</code>.
        </div>
      </footer>
    </div>
  );
}
