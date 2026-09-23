'use client';

import { useEffect, useState } from 'react';
import type { ProvenanceReceipt, ProvenanceClaim, ChainConfig, AnchorResults } from '../lib/types';
import { hashscanTx, hashscanTopic, hashscanToken, hashscanContract } from '../lib/types';
import {
  buildExplorerUrl,
  type AnchorResult,
} from '@provenance-swarm/anchors/client';

/** Map a successful HCS stage into the ledger-neutral anchor shape. */
function toAnchorResults(data: AnchorResults, fallbackNetwork: string): AnchorResult[] {
  const out: AnchorResult[] = [];
  const network = data.hcs.network ?? fallbackNetwork;
  if (data.hcs.ok && data.hcs.transactionId) {
    try {
      out.push({
        ledger: 'hedera-hcs',
        network,
        anchorId: data.hcs.transactionId,
        explorerUrl: buildExplorerUrl('hedera-hcs', network, data.hcs.transactionId),
      });
    } catch {
      // buildExplorerUrl refuses to guess on unknown networks: no row is
      // better than a wrong link.
    }
  }
  return out;
}

export default function AnchorPanel({
  receipt,
  claim,
  onAnchored,
}: {
  receipt: ProvenanceReceipt;
  claim: ProvenanceClaim | null;
  onAnchored?: (anchors: AnchorResult[]) => void;
}) {
  const [config, setConfig] = useState<ChainConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<AnchorResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mirrorBusy, setMirrorBusy] = useState(false);
  const [mirrorResult, setMirrorResult] = useState<{
    found: boolean;
    match: boolean;
    error?: string;
  } | null>(null);

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
        body: JSON.stringify({ receipt, claim }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 502 partial/all-failed still carries per-stage results.
        if (data && (data.hcs || data.contract || data.nft)) {
          setResults(data);
          onAnchored?.(toAnchorResults(data, config?.network ?? 'testnet'));
        }
        setError(data.error || 'Anchoring failed');
      } else {
        setResults(data);
        onAnchored?.(toAnchorResults(data, config?.network ?? 'testnet'));
      }
    } catch {
      setError('Network error while anchoring');
    } finally {
      setBusy(false);
    }
  }

  const network = config?.network ?? 'testnet';

  async function verifyOnMirror() {
    if (!results?.hcs.ok || !results.hcs.topicId || !results.hcs.sequenceNumber) return;
    setMirrorBusy(true);
    setMirrorResult(null);
    try {
      const res = await fetch('/api/mirror-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network: results.hcs.network ?? network,
          topicId: results.hcs.topicId,
          sequenceNumber: results.hcs.sequenceNumber,
          expectedDecisionHash: receipt.decisionHash,
        }),
      });
      setMirrorResult(await res.json());
    } catch {
      setMirrorResult({ found: false, match: false, error: 'Network error' });
    } finally {
      setMirrorBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>4 · Anchor on Hedera</h2>
      <p className="sub">
        Push the receipt out of the offline world: anchor its hash on an HCS topic, record it in the
        on-chain registry contract, and mint a provenance-certificate NFT for verified claims.
      </p>

      {!config?.hedera && (
        <div className="notice">
          Hedera is not configured, so anchoring is disabled. To enable it, copy{' '}
          <code>packages/nextjs/.env.example</code> to <code>.env</code> and set{' '}
          <code>HEDERA_OPERATOR_ID</code> and <code>HEDERA_OPERATOR_KEY</code> (testnet). Everything
          above this step works fully offline.
        </div>
      )}

      {!claim && (
        <div className="notice">
          No claim is attached to this receipt in the UI session. Re-run verification before anchoring.
          The server refuses anchors without a claim it can re-verify.
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
            a topic message: a public, timestamped proof the receipt existed at this time.
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
              </a>{' '}
              ·{' '}
              <a href={results.hcs.mirrorUrl} target="_blank" rel="noreferrer">
                mirror node ↗
              </a>
              <div style={{ marginTop: '0.6rem' }}>
                <button
                  className="btn ghost"
                  style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}
                  onClick={verifyOnMirror}
                  disabled={
                    mirrorBusy ||
                    !results.hcs.sequenceNumber ||
                    results.hcs.sequenceNumber === ''
                  }
                  title={
                    !results.hcs.sequenceNumber || results.hcs.sequenceNumber === ''
                      ? 'No HCS sequence number to verify'
                      : undefined
                  }
                >
                  {mirrorBusy ? (
                    <>
                      <span className="spin" /> Checking mirror…
                    </>
                  ) : (
                    'Verify on mirror node'
                  )}
                </button>
                {mirrorResult && (
                  <div style={{ marginTop: '0.5rem' }}>
                    {mirrorResult.error ? (
                      <span className="badge warn">{mirrorResult.error}</span>
                    ) : !mirrorResult.found ? (
                      <span className="badge warn">
                        not visible yet. Mirror nodes lag consensus by a few seconds; retry shortly
                      </span>
                    ) : mirrorResult.match ? (
                      <span className="badge pass">mirror confirms the anchored decision hash</span>
                    ) : (
                      <span className="badge fail">mirror payload does not match this receipt</span>
                    )}
                  </div>
                )}
              </div>
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
              No registry deployed. Run <code style={{ fontFamily: 'var(--mono)' }}>npm run deploy:testnet --workspace=@provenance-swarm/contracts</code> first.
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
            Mints a non-fungible provenance certificate carrying the decision hash, but only for claims
            the swarm verified.
          </p>
          {receipt.verdict !== 'verified' && (
            <div className="aresult" style={{ color: 'var(--muted)' }}>
              Only verified claims mint certificates. This receipt is “{receipt.verdict}”.
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