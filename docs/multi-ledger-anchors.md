# Multi-ledger anchors — testnet guide

Phase 3: the same provenance receipt attested on more than one ledger. Hedera
HCS is the ported reference and the deepest integration (registry contract +
HTS mint + mirror re-verification). XRPL and Solana have field-proven
keyed-run scripts in `packages/anchors/scripts/`; Base is a fail-closed stub
until its attester passes a live run.

## The rule for every keyed run

**No keyed write without Stanley's run word.** Each ledger's run is its own
authorization window: the network, the account, and the key type are confirmed
before the run word is given, and the run is verified after the fact from the
chain — never from the script's own report. The universal checker
(`packages/anchors/scripts/verify-attestation.mjs`) re-verifies every
attestation from public chain data.

## Per ledger

### Hedera HCS — ported (reference)

The anchor path: `/api/anchor` in the Next.js frontend, backed by
`HederaAnchor` (`packages/swarm/src/hedera.ts`).

- Env: `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HEDERA_KEY_TYPE`
  (`ecdsa` | `ed25519`), `HEDERA_NETWORK` (`testnet`), plus
  `HEDERA_TEMPLATE_TOPIC_ID` to reuse a topic (never the frozen Window 9
  exhibit topic `0.0.10569989`).
- Faucet: Hedera portal testnet faucet for the operator account.
- Verify: HashScan transaction link from the anchor result, then the mirror
  node (`/api/mirror-verify`).
- Proven: 4 anchors (seq 3–6, topic `0.0.10681528`, 2026-09-23) and 4 anchors
  (seq 7–10, same topic, 2026-09-23, independent operator), registry
  `verifyReceipt` true on all 8, NFT serials 4–5 minted.

### XRPL — script ported and field-proven

`packages/anchors/scripts/xrpl-attest.mjs`. Attests each proof envelope as
memos on an XRPL devnet payment (two funded wallets, A→B).

- Run: `node xrpl-attest.mjs --claims claims.json --network devnet`
- Funding: automatic via the devnet faucet.
- Proven: 8/8 attestations, strict `tesSUCCESS`, memo byte-match — 4 on Vera's
  rig and 4 on Devin's independent rig (2026-09-23). Ledgers 5552010+ and
  5552340+.
- Known concern: memo chunking — see `packages/anchors/lessons/xrpl.md`.
- The in-app adapter (`packages/anchors/src/stubs.ts`) remains fail-closed
  until implemented per `packages/anchors/PORTING.md`.

### Solana — script ported and field-proven

`packages/anchors/scripts/solana-attest.mjs`. Attests each proof envelope via
the Solana memo program on devnet.

- Run: `node solana-attest.mjs --claims claims.json`
- Funding: `requestAirdrop` is automatic; if it stalls, the script prints the
  address and waits for a manual top-up at https://faucet.solana.com.
- Proven: 4/4 attestations on Devin's rig (2026-09-23), memo byte-match, slots
  503169804+.
- Known concern: blockhash expiry — see `packages/anchors/lessons/solana.md`.
- The in-app adapter remains fail-closed until implemented per
  `packages/anchors/PORTING.md`.

### Base — stub (not yet field-tested)

The EVM attester (`evm-attest.mjs`) is written and pre-flighted (chainId
84532 verified in-script) but has not passed a live run: Base Sepolia was
blocked on faucet funding on 2026-09-23 (all programmatic faucets required
auth/captcha). It stays out of this repo until it attests real receipts on a
run word. The adapter (`packages/anchors/src/stubs.ts`) throws
`AnchorNotPortedError` until then.

- Known concern: pre-submit assertion — see `packages/anchors/lessons/base.md`.

## What "ported" requires

For the keyed-run scripts: the script lives in `packages/anchors/scripts/`,
a genuine keyed run attested real receipts on the ledger's test network on
Stanley's run word, and the universal checker passed every attestation
(12/12 plain/tamper, 13/13 value claims). For the in-app `LedgerAnchor`
adapters, the full four-criteria checklist in `packages/anchors/PORTING.md`
still applies — a proven script does not auto-promote the adapter.
