# Cross-chain attestation scripts

Field-proven keyed-run tools that attest a provenance receipt's proof envelope on
foreign ledgers, plus the universal checker that independently verifies each
attestation. These are the ported scripts behind the Phase 3 multi-ledger
evidence: every script below has anchored real receipts on a live test network
and every attestation has passed the universal checker.

**House rule: no keyed write without Stanley's run word.** Each ledger's run is
its own authorization window. These scripts never run as part of `npm test`.

## Setup

```bash
cd packages/anchors/scripts
npm install
```

Dependencies: `xrpl` (XRPL), `@solana/web3.js` (Solana), `ethers` (EVM chains,
checker registry reads).

## The proof envelope

Each attestation carries the same envelope, built from the template's Hedera
anchor (`claims.json`):

```json
{
  "topic": "0.0.10681528",
  "proofs": [{
    "claimId": "claim-…",
    "verdict": "verified | needs_review",
    "decisionHash": "…",
    "taskHash": "…",
    "sequenceNumber": "7",
    "consensusTimestamp": "1790201052.444063807"
  }]
}
```

Build `claims.json` from YOUR anchor records (your claim IDs, your decision
hashes, your HCS sequences). Never reuse another operator's values: the
envelope is byte-checked against the HCS message, so a copied envelope fails
the checker.

## XRPL (`xrpl-attest.mjs`) — proven live

Attests each envelope as memos on an XRPL payment (two funded wallets, A→B;
self-payments are rejected by the ledger, so the two-wallet design is load-
bearing, not cosmetic).

```bash
node xrpl-attest.mjs --claims claims.json --network devnet
```

- Funding is automatic via the devnet faucet.
- Proven: 8/8 attestations, `tesSUCCESS`, memo byte-match — 4 on Vera's rig
  (2026-09-23) and 4 on Devin's independent rig (2026-09-23).
- Output: `xrpl-evidence-<timestamp>.json`.

## Solana (`solana-attest.mjs`) — proven live

Attests each envelope via the Solana memo program on devnet.

```bash
node solana-attest.mjs --claims claims.json
```

- Funding: `requestAirdrop` is automatic; if it stalls, the script prints the
  address and waits for a manual top-up at https://faucet.solana.com.
- Proven: 4/4 attestations on Devin's rig (2026-09-23), memo byte-match.
- Output: `solana-evidence-<timestamp>.json`.

## Universal checker (`verify-attestation.mjs`) — the product

Independently verifies one attestation, end to end, from public chain data.
Takes a transaction hash or signature, re-reads the foreign-chain transaction,
decodes the envelope, then back-checks every field against Hedera: the HCS
message (claimId, decisionHash, taskHash, verdict, timestamp), the registry
`verifyReceipt`, and the Chainlink HBAR/USD feed for value claims.

```bash
node verify-attestation.mjs xrpl <tx-hash>
node verify-attestation.mjs solana <signature>
node verify-attestation.mjs evm <tx-hash> --rpc <evm-rpc-url>
```

Expect 12/12 checks on plain/tamper claims, 13/13 on value claims (the 13th is
the Chainlink oracle check). Any FAIL means the attestation does not verify —
stop and report, do not continue to the next chain.

## Provenance

These scripts are the in-repo port of the toolkit first built and field-tested
2026-09-23. XRPL was proven on two independent rigs (Vera's and Devin's);
Solana was proven on Devin's rig. The Base Sepolia script (`evm-attest.mjs`)
exists in the run toolkit but is not yet field-tested — it stays out of this
repo until it passes a live run, per the house rule against unproven code.
