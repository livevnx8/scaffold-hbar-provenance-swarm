# Multi-ledger anchors — testnet guide

Phase 3 scaffolding: the same provenance receipt anchored on more than one
ledger through one common interface (`@provenance-swarm/anchors`). Hedera HCS
is the ported reference; XRPL, Solana, and Base are fail-closed stubs until
their scripts are ported and re-verified.

## The rule for every keyed run

**No keyed write without Stanley's run word.** Each ledger's anchor run is its
own authorization window: the network, the account, and the key type are
confirmed before the run word is given, and the run is verified after the fact
from the chain — never from the script's own report. The evidence view links
every anchor to the ledger's own explorer so anyone can re-check.

## Per ledger

### Hedera HCS — ported

The existing anchor path: `/api/anchor` in the Next.js frontend, backed by
`HederaAnchor` (`packages/swarm/src/hedera.ts`).

- Env: `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HEDERA_KEY_TYPE`
  (`ecdsa` | `ed25519`), `HEDERA_NETWORK` (`testnet`), plus
  `HEDERA_TEMPLATE_TOPIC_ID` to reuse a topic (never the frozen Window 9
  exhibit topic `0.0.10569989`).
- Faucet: Hedera portal testnet faucet for the operator account.
- Verify: HashScan transaction link from the anchor result, then the mirror
  node (`/api/mirror-verify`).

### XRPL — pending port

Devin confirmed the anchor script works on his machine; the verified port and
its stranger-machine re-verification are outstanding. The adapter
(`packages/anchors/src/stubs.ts`) throws `AnchorNotPortedError` until then.

- Env: to be transcribed from Devin's verified script on port.
- Faucet: to be transcribed from Devin's verified script on port.
- Known concern: memo chunking — see `packages/anchors/lessons/xrpl.md`.

### Solana — pending port

Same status as XRPL: confirmed working on Devin's machine, port and
re-verification outstanding, adapter fail-closed.

- Env: to be transcribed from Devin's verified script on port.
- Faucet: Solana devnet faucet (to be confirmed against the verified script).
- Known concern: blockhash expiry — see `packages/anchors/lessons/solana.md`.

### Base — pending port

Same status: confirmed working on Devin's machine, port and re-verification
outstanding, adapter fail-closed.

- Env: to be transcribed from Devin's verified script on port.
- Faucet: Base Sepolia faucet (to be confirmed against the verified script).
- Known concern: pre-submit assertion — see `packages/anchors/lessons/base.md`.

## What "ported" requires

A ledger counts as ported only when: the script is implemented against the
`LedgerAnchor` interface, a genuine keyed run anchored a real receipt on the
ledger's test network on Stanley's run word, a stranger machine re-ran it
with matching `anchorId`, and the evidence view row renders the live explorer
link. Full checklist in `packages/anchors/PORTING.md`.
