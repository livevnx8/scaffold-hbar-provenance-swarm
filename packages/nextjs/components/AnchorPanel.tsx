'use client';

import { useEffect, useState } from 'react';
import type { ProvenanceReceipt, ChainConfig, AnchorResults } from '../lib/types';
import { hashscanTx, hashscanTopic, hashscanToken, hashscanContract } from '../lib/types';

export default function AnchorPanel({ receipt }: { receipt: ProvenanceReceipt }) {
  const [config, setConfig] = useState<ChainConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<AnchorResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  async function anchor() {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch('/api/anchor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Anchoring failed');
      } else {
        setResults(data);
      }
    } catch {
      setError('Network error while anchoring');
    } finally {
      setBusy(false);
    }
  }

  const network = config?.network ?? 'testnet';

  return (
    <div className="card">
      <h2>4 · Anchor on Hedera</h2>
      <p className="sub">
        Push the receipt out of the offline world: anchor its hash on an HCS topic, record it in the
        on-chain registry contract, and mint a provenance-certificate NFT for verified claims.
      </p>

      {!config?.hedera && (
        <div className="notice">
          Hedera is not configured — anchoring is disabled. To enable it, copy{' '}
          <code>packages/nextjs/.env.example</code> to <code>.env</code> and set{' '}
          <code>HEDERA_OPERATOR_ID</code> and <code>HEDERA_OPERATOR_KEY</code> (testnet). Everything
          above this step works fully offline.
        </div>
      )}

      {error && <div className="notice error">{error}</div>}

      <div className="anchor-actions">
        <div className="action">
          <div className="ahead">
            <span className="aname">HCS receipt anchor</span>
            {results ? (
              <span className={`badge ${results.hcs.ok ? 'pass' : 'fail'}`}>
                {results.hcs.ok ? 'Anchored' : 'Failed'}
              </span>
            ) : (
              <span className="badge muted">HCS topic</span>
            )}
          </div>
          <p className="adesc">
            Submits <code style={{ fontFamily: 'var(--mono)' }}>{receipt.decisionHash.slice(0, 16)}…</code> as
            a topic message — a public, timestamped proof the receipt existed at this time.
          </p>
          {results?.hcs.ok && (
            <div className="aresult">
              seq #{results.hcs.sequenceNumber} ·{' '}
              <a href={hashscanTx(network, results.hcs.transactionId!)} target="_blank" rel="noreferrer">
                view transaction ↗
              </a>{' '}
              ·{' '}
              <a href={hashscanTopic(network, results.hcs.topicId!)} target="_blank" rel="noreferrer">
                view topic ↗
              </a>
            </div>
          )}
          {results && !results.hcs.ok && <div className="aresult" style={{ color: 'var(--red)' }}>{results.hcs.error}</div>}
        </div>

        <div className="action">
          <div className="ahead">
            <span className="aname">Registry contract</span>
            {results ? (
              <span className={`badge ${results.contract.ok ? 'pass' : 'fail'}`}>
                {results.contract.ok ? 'Recorded' : results.contract.skipped ? 'Skipped' : 'Failed'}
              </span>
            ) : (
              <span className="badge muted">Smart contract</span>
            )}
          </div>
          <p className="adesc">
            Calls <code style={{ fontFamily: 'var(--mono)' }}>anchorReceipt</code> on{' '}
            <code style={{ fontFamily: 'var(--mono)' }}>ProvenanceRegistry</code> so anyone can verify a
            presented receipt against the chain.
          </p>
          {!config?.registry && (
            <div className="aresult" style={{ color: 'var(--muted)' }}>
              No registry deployed — run <code style={{ fontFamily: 'var(--mono)' }}>yarn workspace @provenance-swarm/contracts deploy:testnet</code> first.
            </div>
          )}
          {results?.contract.ok && (
            <div className="aresult">
              <a href={hashscanTx(network, results.contract.transactionId!)} target="_blank" rel="noreferrer">
                view transaction ↗
              </a>{' '}
              ·{' '}
              <a href={hashscanContract(network, results.contract.address!)} target="_blank" rel="noreferrer">
                view contract ↗
              </a>
            </div>
          )}
          {results && !results.contract.ok && !results.contract.skipped && (
            <div className="aresult" style={{ color: 'var(--red)' }}>{results.contract.error}</div>
          )}
        </div>

        <div className="action">
          <div className="ahead">
            <span className="aname">Certificate NFT</span>
            {results ? (
              <span className={`badge ${results.nft.ok ? 'pass' : 'fail'}`}>
                {results.nft.ok ? 'Minted' : results.nft.skipped ? 'Skipped' : 'Failed'}
              </span>
            ) : (
              <span className="badge muted">HTS</span>
            )}
          </div>
          <p className="adesc">
            Mints a non-fungible provenance certificate carrying the decision hash — only for claims
            the swarm verified.
          </p>
          {receipt.verdict !== 'verified' && (
            <div className="aresult" style={{ color: 'var(--muted)' }}>
              Only verified claims mint certificates — this receipt is “{receipt.verdict}”.
            </div>
          )}
          {results?.nft.ok && (
            <div className="aresult">
              serial #{results.nft.serial} ·{' '}
              <a href={hashscanTx(network, results.nft.transactionId!)} target="_blank" rel="noreferrer">
                view transaction ↗
              </a>{' '}
              ·{' '}
              <a href={hashscanToken(network, results.nft.tokenId!)} target="_blank" rel="noreferrer">
                view token ↗
              </a>
            </div>
          )}
          {results && !results.nft.ok && !results.nft.skipped && (
            <div className="aresult" style={{ color: 'var(--red)' }}>{results.nft.error}</div>
          )}
        </div>
      </div>

      <div className="btnrow">
        <button className="btn" onClick={anchor} disabled={busy || !config?.hedera}>
          {busy ? (
            <>
              <span className="spin" /> Anchoring…
            </>
          ) : (
            'Anchor on Hedera →'
          )}
        </button>
      </div>
    </div>
  );
}