# Porting a ledger anchor

`@provenance-swarm/anchors` is the Phase 3 multi-ledger evidence package. One
interface (`LedgerAnchor`), one ported reference (Hedera HCS), three fail-closed
stubs (XRPL, Solana, Base).

## What "ported" means

A ledger flips `ported: false` → `true` in `src/ledgers.ts` only when ALL of
these hold:

1. The ledger's anchor script is implemented against the `LedgerAnchor`
   interface (same `AnchorRequest` in, same `AnchorResult` out).
2. A genuine keyed run anchored a real receipt on the ledger's test network,
   on Stanley's explicit run word (every keyed write is its own authorization
   window — see `docs/multi-ledger-anchors.md`).
3. The anchor was re-verified on a stranger machine: independent run of the
   same script, same receipt, matching `anchorId`, and the explorer link
   resolves to the anchored payload.
4. The evidence view row for the ledger renders the live link.

Until then the stub stays, and `anchor()` keeps throwing
`AnchorNotPortedError`. A stub never fabricates a result — an unported ledger
can never show a fake green.

## How to port a ledger

1. Implement the adapter in `src/<ledger>.ts`. It must satisfy `LedgerAnchor`:
   - `anchor()` performs exactly one anchor and returns the ledger-native
     proof pointer as `anchorId` plus the explorer link.
   - Call `assertValidAnchorRequest(request)` before touching the backend —
     malformed requests fail before any keyed operation.
   - `explorerUrl()` stays pure (no network). Extend `buildExplorerUrl` in
     `src/explorer.ts` for any new network, including the anchor-id shape in
     `ANCHOR_ID_PATTERNS` so malformed ids can never produce a misleading link.
   - Keyed backends (operator keys, signers) are constructor-injected, read
     from env at the call site, never imported by this package. Unit tests
     use fakes; the house rule stands: no ledger I/O inside unit tests.
2. Add the per-ledger lessons to `lessons/<ledger>.md` (chunking limits,
   finality/expiry behavior, pre-submit assertions — transcribed from the
   verified script, not invented).
3. Flip `ported: true` and the `statusNote` in `src/ledgers.ts`.
4. Add conformance tests in `tests/`: the adapter returns a well-formed
   `AnchorResult` against a fake backend; the explorer builder produces the
   exact expected URLs; unknown networks throw.
5. Wire the keyed run path (API route or script) and document it in
   `docs/multi-ledger-anchors.md` as a run-word-gated operation: one command,
   exact env, exact faucet.

## Design notes

- Hedera stays the deepest integration (registry contract + HCS + HTS mint +
  mirror re-verification). The other ledgers are extensions, never
  replacements.
- `src/client.ts` is the browser-safe entry point (types + explorer builders
  + ledger metadata, zero SDK imports). The Next.js evidence view imports only
  from there. Server code imports the full entry point.
- If a phase threatens the gate, cut the phase, not the gate. A ledger port
  that cannot be re-verified ships as a documented stub with its verified
  artifacts cited — never as a half-live adapter.
