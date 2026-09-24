# Registry redeploy: operator-hardened ProvenanceRegistry (Hedera testnet)

## Status: NOT RUN

## Why

The registry contract referenced in the README's live-identifiers table
(`0x5Ad54d39d860Cb2c2c6A27c787eead7358137e1a`) was deployed before the
operator hardening landed in source. The current
`packages/hardhat/contracts/ProvenanceRegistry.sol` gates anchoring to an
operator (`onlyOperator` on `anchorReceipt`, plus `transferOperator`); the
deployed instance does not. Until this redeploy runs, the on-chain contract
a reader opens on HashScan is the pre-hardening build.

Honesty bound: never describe the live testnet registry as operator-gated
until the address in the README is a deployment of the current source.

## Authorization

This is a keyed action. It needs two things at run time:

1. An explicit run word for THIS deploy window.
2. The operator private key, supplied transiently for the single deploy
   command, via environment variable only. Never written to a file, never
   logged, never committed, never retained after the run.

No run word + no key = no deploy.

## Preconditions (halt and report if any fails)

1. Working tree clean; deploy from the main tip, no local modifications.
2. Network is `hederaTestnet` (chain ID 296). If any config or prompt points
   at mainnet, stop and report.
3. The operator account is designated and funded with enough HBAR for one
   contract deploy.

## Key handling

- The key lives only in the `HEDERA_OPERATOR_KEY` environment variable for
  one command invocation.
- `hardhat.config.ts` also loads `packages/nextjs/.env` via dotenv: do NOT
  put the key in any `.env` file. Inline env var on the single command only.
- Never echo the key, never print env. Unset the variable after the deploy
  and confirm it is unset.

## Procedure

1. From `packages/hardhat/`:

   ```bash
   HEDERA_OPERATOR_KEY='<key>' npm run deploy:testnet
   ```

   Capture the full stdout: the deployed address and the transaction hash.
2. Verify read-only on the new contract:
   - `operator()` returns the deployer/operator account.
   - `verifyReceipt` on an unknown claim ID returns false (or reverts
     cleanly; record the actual behavior).
3. Verify the gate (one write, then read back):
   - From a NON-operator account, attempt `anchorReceipt` and confirm it
     reverts. Record the revert.
   - From the operator account, anchor one test claim, then confirm
     `verifyReceipt(claimId, decisionHash)` returns true.
   - Record the HashScan testnet contract link for the new address.
4. Report: new registry address, deploy transaction hash, HashScan link,
   the three verification results, and the main tip deployed from.

## Follow-up (separate docs change, after the deploy is confirmed)

Update the README's live-identifiers table and `packages/nextjs/.env.example`
notes to the new address. Docs-only; do not bundle it into the deploy
window.

## Boundaries

Testnet only. One contract deploy plus the verification writes above. No
other chain writes, no token mints, no HCS anchors in this window.
