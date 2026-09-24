'use client';

import { useState } from 'react';

type Chain = 'xrpl' | 'solana';

/**
 * Real attestations from the 2026-09-23 field run
 * (docs/e2e/E2E-TESTNET-2026-09-23.md). Anyone can paste one in and run the
 * checker against public chain data — no account, no key, no trust in this page.
 */
const FIELD_EXAMPLES: Record<Chain, string> = {
  xrpl: 'D30352E025FF1F0112E8B3CD82107412C02B34538262FC43A93AA75450C18160',
  solana:
    '3L7xNX3SuYP7W4zoSJFmT9gbZp5nWjs9EXNkUzLYx5b889iF5up3WzLUV6B2JcNeRbdsPzGLiVd6CjxCKDJCMnrd',
};

/**
 * Check a cross-chain attestation.
 *
 * The universal checker is the product: one script that re-reads any XRPL or
 * Solana attestation from public chain data and back-checks every field
 * against Hedera (the HCS message, the registry, and the Chainlink feed on
 * value claims). The in-app XRPL/Solana adapters are fail-closed stubs —
 * anchoring happens through the keyed scripts in packages/anchors/scripts/ —
 * so this panel is the read-only half: verification, copy-paste ready.
 */
export default function AttestationChecker() {
  const [chain, setChain] = useState<Chain>('xrpl');
  const [ref, setRef] = useState('');
  const [copied, setCopied] = useState(false);

  const trimmed = ref.trim();
  const command = `cd packages/anchors/scripts && node verify-attestation.mjs ${chain} ${
    trimmed || '<tx-hash-or-signature>'
  }`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <h2>Check a cross-chain attestation</h2>
      <p className="sub">
        The universal checker is the product. Paste an XRPL transaction hash or a Solana
        signature and it re-reads the attestation from public chain data, then back-checks
        every field against Hedera. Run the command where you cloned this repo: no account,
        no key, no trust in this page.
      </p>
      <div className="tabs" style={{ marginBottom: '0.9rem' }}>
        <button className={chain === 'xrpl' ? 'active' : ''} onClick={() => setChain('xrpl')}>
          XRPL devnet
        </button>
        <button className={chain === 'solana' ? 'active' : ''} onClick={() => setChain('solana')}>
          Solana devnet
        </button>
      </div>
      <div className="field">
        <label htmlFor="attestation-ref">
          {chain === 'xrpl' ? 'Transaction hash' : 'Transaction signature'}
        </label>
        <input
          id="attestation-ref"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder={chain === 'xrpl' ? 'e.g. D30352E0…' : 'e.g. 3L7xNX3S…'}
          spellCheck={false}
        />
      </div>
      <div className="btnrow">
        <button className="btn ghost" onClick={() => setRef(FIELD_EXAMPLES[chain])}>
          Use a real one from the 2026-09-23 field run
        </button>
      </div>
      <div className="hash" style={{ marginTop: '1rem' }}>
        <code>{command}</code>
        <button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <p className="sub" style={{ marginTop: '0.75rem' }}>
        Expect <strong>12/12</strong> checks on plain and tamper claims, <strong>13/13</strong>{' '}
        on value claims (the 13th is the Chainlink oracle check). Any FAIL means the
        attestation does not verify, so stop and report. Full script docs:{' '}
        <code style={{ fontFamily: 'var(--mono)' }}>packages/anchors/scripts/README.md</code>.
      </p>
    </div>
  );
}
