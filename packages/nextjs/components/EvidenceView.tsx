'use client';

import {
  LEDGERS,
  LEDGER_META,
  type AnchorResult,
} from '@provenance-swarm/anchors/client';

/**
 * 5 · Multi-ledger evidence.
 *
 * The same receipt, anchored on more than one ledger. Every anchored row links
 * out to the ledger's own explorer, so anyone can verify the anchor without
 * trusting this page. Ledgers whose scripts are not yet ported render as
 * "Pending port" — the adapters are fail-closed stubs that refuse to
 * fabricate a result, so a pending row can never show a fake green.
 */
export default function EvidenceView({ anchors }: { anchors: AnchorResult[] }) {
  const byLedger = new Map(anchors.map((a) => [a.ledger, a]));

  return (
    <div className="card">
      <h2>5 · Multi-ledger evidence</h2>
      <p className="sub">
        The same receipt, anchored on more than one ledger. Each anchored row links to the
        ledger&apos;s own explorer. Hedera stays the deepest integration; the other ledgers
        are extensions, never replacements.
      </p>
      <div className="anchor-actions">
        {LEDGERS.map((ledger) => {
          const meta = LEDGER_META[ledger];
          const hit = byLedger.get(ledger);
          return (
            <div className="action" key={ledger}>
              <div className="ahead">
                <span className="aname">{meta.displayName}</span>
                {hit ? (
                  <span className="badge pass">Anchored</span>
                ) : (
                  <span className="badge muted">Pending port</span>
                )}
              </div>
              <p className="adesc">{meta.statusNote}</p>
              {hit ? (
                <div className="aresult">
                  <code style={{ fontFamily: 'var(--mono)' }}>{hit.anchorId.slice(0, 28)}…</code>{' '}
                  ·{' '}
                  <a href={hit.explorerUrl} target="_blank" rel="noreferrer">
                    view on {meta.explorerName} ↗
                  </a>
                </div>
              ) : (
                <div className="aresult" style={{ color: 'var(--muted)' }}>
                  No anchor yet. This adapter is a fail-closed stub: it throws instead of
                  fabricating a result until the verified port lands.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
