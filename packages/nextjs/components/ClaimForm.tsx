'use client';

import { useState } from 'react';
import type { ProvenanceClaim, CustodyLink, ProvenanceDocument } from '../lib/types';

function emptyClaim(): ProvenanceClaim {
  return {
    claimId: '',
    product: '',
    lot: '',
    origin: { farm: '', region: '', harvestDate: '', statement: '', attestationHash: '' },
    custody: [{ holder: '', receivedAt: '', handoffHash: '' }],
    documents: [{ name: '', sha256: '' }],
  };
}

export default function ClaimForm({
  onVerify,
  busy,
}: {
  onVerify: (claim: ProvenanceClaim) => void;
  busy: boolean;
}) {
  const [claim, setClaim] = useState<ProvenanceClaim>(emptyClaim());
  const [loadingFixture, setLoadingFixture] = useState(false);

  function set<K extends keyof ProvenanceClaim>(key: K, value: ProvenanceClaim[K]) {
    setClaim((c) => ({ ...c, [key]: value }));
  }

  function setOrigin(key: keyof ProvenanceClaim['origin'], value: string) {
    setClaim((c) => ({ ...c, origin: { ...c.origin, [key]: value } }));
  }

  function setLink(i: number, key: keyof CustodyLink, value: string) {
    setClaim((c) => ({
      ...c,
      custody: c.custody.map((l, j) => (j === i ? { ...l, [key]: value } : l)),
    }));
  }

  function setDoc(i: number, key: keyof ProvenanceDocument, value: string) {
    setClaim((c) => ({
      ...c,
      documents: c.documents.map((d, j) => (j === i ? { ...d, [key]: value } : d)),
    }));
  }

  async function loadFixture() {
    setLoadingFixture(true);
    try {
      const res = await fetch('/api/fixture');
      const data = await res.json();
      setClaim(data);
    } finally {
      setLoadingFixture(false);
    }
  }

  return (
    <div className="card">
      <h2>1 · Describe the claim</h2>
      <p className="sub">
        A provenance claim is a product's origin attestation, its custody chain, and the documents
        that back it up. Load the fixture for a known-good claim, or fill in your own.
      </p>

      <div className="grid2">
        <div className="field">
          <label>Claim ID</label>
          <input value={claim.claimId} onChange={(e) => set('claimId', e.target.value)} placeholder="claim-cof-042" />
        </div>
        <div className="field">
          <label>Lot</label>
          <input value={claim.lot} onChange={(e) => set('lot', e.target.value)} placeholder="COF-042" />
        </div>
      </div>
      <div className="field">
        <label>Product</label>
        <input value={claim.product} onChange={(e) => set('product', e.target.value)} placeholder="Washed Arabica Coffee" />
      </div>

      <div className="rowhead" style={{ marginTop: '1.25rem' }}>
        <span>Origin attestation</span>
      </div>
      <div className="grid2">
        <div className="field">
          <label>Farm / maker</label>
          <input value={claim.origin.farm} onChange={(e) => setOrigin('farm', e.target.value)} />
        </div>
        <div className="field">
          <label>Region</label>
          <input value={claim.origin.region} onChange={(e) => setOrigin('region', e.target.value)} />
        </div>
        <div className="field">
          <label>Harvest date (YYYY-MM-DD)</label>
          <input value={claim.origin.harvestDate} onChange={(e) => setOrigin('harvestDate', e.target.value)} placeholder="2026-03-15" />
        </div>
        <div className="field">
          <label>Attestation hash (sha256)</label>
          <input value={claim.origin.attestationHash} onChange={(e) => setOrigin('attestationHash', e.target.value)} placeholder="sha256(farm|region|harvestDate|statement)" />
        </div>
      </div>
      <div className="field">
        <label>Statement</label>
        <input value={claim.origin.statement} onChange={(e) => setOrigin('statement', e.target.value)} />
      </div>

      <div className="rowhead" style={{ marginTop: '1.25rem' }}>
        <span>Custody chain</span>
        <button
          className="btn ghost"
          style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }}
          onClick={() => set('custody', [...claim.custody, { holder: '', receivedAt: '', handoffHash: '' }])}
        >
          + Add handoff
        </button>
      </div>
      {claim.custody.map((link, i) => (
        <div className="rowitem" key={i}>
          <div className="rowhead">
            <span>Handoff {i + 1}</span>
            {claim.custody.length > 1 && (
              <button className="linkbtn" onClick={() => set('custody', claim.custody.filter((_, j) => j !== i))}>
                Remove
              </button>
            )}
          </div>
          <div className="grid2">
            <div className="field">
              <label>Holder</label>
              <input value={link.holder} onChange={(e) => setLink(i, 'holder', e.target.value)} />
            </div>
            <div className="field">
              <label>Received at (ISO)</label>
              <input value={link.receivedAt} onChange={(e) => setLink(i, 'receivedAt', e.target.value)} placeholder="2026-03-20T09:00:00Z" />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Handoff hash</label>
            <input value={link.handoffHash} onChange={(e) => setLink(i, 'handoffHash', e.target.value)} placeholder="sha256(prevHolder|holder|receivedAt)" />
          </div>
        </div>
      ))}

      <div className="rowhead" style={{ marginTop: '1.25rem' }}>
        <span>Documents</span>
        <button
          className="btn ghost"
          style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }}
          onClick={() => set('documents', [...claim.documents, { name: '', sha256: '' }])}
        >
          + Add document
        </button>
      </div>
      {claim.documents.map((doc, i) => (
        <div className="rowitem" key={i}>
          <div className="rowhead">
            <span>Document {i + 1}</span>
            {claim.documents.length > 1 && (
              <button className="linkbtn" onClick={() => set('documents', claim.documents.filter((_, j) => j !== i))}>
                Remove
              </button>
            )}
          </div>
          <div className="grid2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Name</label>
              <input value={doc.name} onChange={(e) => setDoc(i, 'name', e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>SHA-256</label>
              <input value={doc.sha256} onChange={(e) => setDoc(i, 'sha256', e.target.value)} placeholder="64-char hex" />
            </div>
          </div>
        </div>
      ))}

      <div className="btnrow">
        <button className="btn ghost" onClick={loadFixture} disabled={loadingFixture || busy}>
          {loadingFixture ? 'Loading…' : 'Load coffee fixture'}
        </button>
        <button
          className="btn ghost"
          onClick={() =>
            setClaim((c) => ({
              ...c,
              claimId: c.claimId ? `${c.claimId}-tampered` : 'claim-tampered',
              origin: { ...c.origin, attestationHash: 'f'.repeat(64) },
            }))
          }
          disabled={busy || !claim.origin.attestationHash}
          title="Overwrite the origin attestation hash so the next verification must refuse"
        >
          Tamper attestation
        </button>
        <button className="btn" onClick={() => onVerify(claim)} disabled={busy}>
          {busy ? (
            <>
              <span className="spin" /> Verifying…
            </>
          ) : (
            'Run verification →'
          )}
        </button>
      </div>
      <p className="sub" style={{ marginTop: '0.75rem' }}>
        Tip: load the fixture and verify (GREEN), then click <strong>Tamper attestation</strong> and
        verify again. A tampered attestation yields a <code>needs_review</code> verdict that names the
        failing worker — the receipt records that outcome truthfully; it is not mintable as verified.
      </p>
    </div>
  );
}
