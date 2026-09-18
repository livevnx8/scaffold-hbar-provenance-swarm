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
  const [receipt, setReceipt] = useState<ProvenanceReceipt | null>(null);
  const [report, setReport] = useState<DoubleVerifierReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  async function verify(claim: ProvenanceClaim) {
    setBusy(true);
    setError(null);
    setReceipt(null);
    setReport(null);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(claim),
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

  const stage = busy ? 1 : !receipt ? 0 : 3;

  return (
    <div className="container">
      <header className="hero">
        <div className={`netbadge ${config?.hedera ? 'live' : ''}`}>
          <span className="dot" />
          {config ? (config.hedera ? `Hedera ${config.network} connected` : 'Offline demo mode') : '…'}
        </div>
        <h1>
          <span className="brand">Provenance</span> Swarm
        </h1>
        <p>
          Verifiable supply-chain provenance on Hedera. A deterministic agent swarm checks a product's
          origin, custody chain, and documents — then anchors the tamper-evident receipt on-chain for
          anyone to replay.
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
              <AnchorPanel key={`a-${runId}`} receipt={receipt} />
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
        <code>npm create scaffold-hbar@latest -- --template livevnx8/scaffold-hbar-provenance-swarm</code>
        <div style={{ marginTop: '0.75rem' }}>
          Offline verification runs with no Hedera account. Anchoring, the registry contract, and
          certificate mints need testnet credentials in <code>packages/nextjs/.env</code>.
        </div>
      </footer>
    </div>
  );
}