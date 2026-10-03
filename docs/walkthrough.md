# Walkthrough

The guided path through the template, step by step. Back to the [README](../README.md).

## The 90-second path (start here)

Read in order. Everything after this section is extension material: cross-chain
attestations, the value oracle, and the universal checker all build on the pattern
below, and none of them is needed to judge it. (A historical research appendix lives
in `docs/history/`.)

**1. Scaffold it.** One non-interactive command, copy-paste ready. The positional
project name plus `--ci` keep the CLI from hanging on prompts; this is the exact
form that passed the gate transcript in
[`docs/e2e/CLI-SCAFFOLD-GATE-2026-09-24.md`](./e2e/CLI-SCAFFOLD-GATE-2026-09-24.md):

```bash
npx create-scaffold-hbar@latest my-provenance-swarm \
  --template livevnx8/scaffold-hbar-provenance-swarm --package-manager npm \
  --solidity-framework hardhat --ci
```

The scaffold creates a `my-provenance-swarm/` directory; `cd` into it before step 2.

The default branch is `main`, so the bare `--template owner/repo` form resolves the
template tarball directly. `--solidity-framework hardhat` and `--package-manager npm`
match this template's tested setup; `--ci` runs the scaffold without prompting.

**2. Run the demo.** No Hedera account needed. From the repo root (do not run it
workspace-scoped: the oracle package names its script `demo:plan`; the root `demo` script
wires it up):

```bash
npm install   # ~9 minutes on a clean machine; Node >= 20.18.3
npm run build # builds the workspace packages; required once
npm run demo  # ~30 seconds, fully offline
```

You see **GREEN / GREEN / RED / RED-value / RED-oracle / RED-mirror**:

1. **GREEN**: a valid coffee-shipment claim verifies.
2. **GREEN**: a second valid lot verifies.
3. **RED**: a tampered attestation is refused; the receipt truthfully records
   `needs_review` and names the failing worker.
4. **RED-value**: a claim declaring a 100x USD equivalent against its HBAR amount is
   refused by the value-attestation worker, which recomputes the implied USD value from a
   pinned Chainlink round (a recorded real testnet round, so the demo stays deterministic
   and offline) and fails the 0.5x-2x band.
5. **RED-oracle**: a claim whose committed Chainlink round was forged to make a 100x value
   look consistent passes the offline re-run, then is refused because the round does not
   match `getRoundData(roundId)` on the pinned Chainlink proxy (a recorded real response,
   so the demo stays offline). The anchor route runs this re-read on the server before any
   write.
6. **RED-mirror**: two recorded testnet mirror responses, one from each team operator
   (`0.0.9034044`, `0.0.10685865`), match. A clearly labelled synthetic copy of the same
   message, paid for by an account outside the allowlist, is refused (`payer-mismatch`)
   even though its `decisionHash` matches.

**3. Tamper a claim.** Supply-chain claims are easy to forge and hard to re-check. This
template turns a product claim into a tamper-evident receipt: the same claim always yields
the same worker verdicts, hashes bind the claim to those verdicts, and a tampered claim
can never silently become verified. The receipt refuses to lie: it records `needs_review`
with the refusing worker named. Try it in the UI: load the coffee fixture, verify, then
click **Tamper attestation** or **Tamper value** and verify again to watch the refused
claim explain itself.

**4. Anchor the verified receipt.** A verified receipt anchors three ways on Hedera
testnet: the receipt goes out as an HCS topic message, the `decisionHash` is stored per
claim in the `ProvenanceRegistry` smart contract (one anchor per claim; duplicates
refused), and a provenance-certificate NFT (HTS) is minted for verified claims only.
`needs_review` claims anchor the refusal but mint nothing. A forged "verified" receipt, or
committed Chainlink evidence that does not match the chain, is refused at the server gate
before any HCS, registry, or NFT write (HTTP 403). Anchoring spends the operator's HBAR, so
the route is off until you set `ANCHOR_API_TOKEN` (see [Going to testnet](./going-to-testnet.md#environment)).

**5. Open HashScan.** The live testnet evidence is documented with links under
[Testnet evidence](./testnet-evidence.md): registry deployment, HCS anchors,
`anchorReceipt` calls and NFT mints from the two team operators on 2026-09-23, and the
post-hardening registry deploy on 2026-09-24.

**6. Re-check the receipt.** Use the app's **Check a receipt** tab (`/api/contract-verify`,
`/api/mirror-verify`), or skip our server entirely and query the public mirror node yourself
(see [Check it yourself](./testnet-evidence.md#check-it-yourself-without-our-server)). A mirror match counts only
if the message is on topic `0.0.10681528` and was paid for by an account on the operator
allowlist (`0.0.9034044`, `0.0.10685865`).
That is the whole core pattern: deterministic receipt, Hedera anchor, re-check.

## Advanced extensions (read after the path above)

Everything here builds on the core pattern; none of it is required to judge it.

- **Cross-chain attestations (XRPL, Solana).** The same proof envelope (claim ID, verdict,
  decision hash, task hash, HCS sequence, consensus timestamp) is attested on XRPL and
  Solana devnets as memo-carrying transactions whose payloads byte-match the Hedera
  anchor. Field-proven scripts live in `packages/anchors/scripts/`. See
  [`docs/multi-ledger-anchors.md`](./multi-ledger-anchors.md).
- **Chainlink value-attestation oracle.** A worker recomputes a claim's implied USD value
  from a pinned Chainlink round and enforces a 0.5x-2x band; the demo's RED-value act
  exercises it against a recorded round, offline. See `packages/oracle/`.
- **Universal checker.** One script takes any attestation, an XRPL hash or a Solana
  signature, re-reads the foreign transaction, decodes the envelope, and back-checks every
  field against Hedera. The app's **Check a receipt** tab exposes it through the
  AttestationChecker panel, which prefills real 2026-09-23 attestation IDs and prints the
  exact checker command to run; the panel does not execute the foreign-ledger read in the
  browser. See `packages/anchors/scripts/`.
- **Historical research appendix.** A frozen, read-only research tape on Hedera testnet
  topic `0.0.10569989`; template live paths refuse to write to it. Exhibit at
  [`docs/history/window-9/appendix.md`](./history/window-9/appendix.md).

## Quick start (no Hedera account needed)

```bash
npm install          # ~9 minutes on a clean machine; Node >= 20.18.3
npm run build        # builds swarm, anchors, oracle, then nextjs; required before `dev`
npm run demo         # GREEN / GREEN / RED / RED-value / RED-oracle / RED-mirror, offline
npm run test         # workspace unit tests, all offline
```

Build ordering matters: `nextjs` and `oracle` import the swarm package's compiled
`dist/`, and the oracle tests import both compiled packages. Root `npm run test`
builds swarm + anchors + oracle first via `build:test-deps`, so a clean
checkout works with a single `npm run test`. Per-workspace tests
(`npm run test --workspace ...`) need `npm run build` first, or they fail with
`MODULE_NOT_FOUND`.

Run the frontend:

```bash
npm run build        # if you have not already
npm run dev --workspace @provenance-swarm/nextjs    # http://localhost:3000
```

The UI runs fully offline until you add Hedera credentials. The header badge reads
"Offline demo mode" vs "Hedera testnet configured", and the anchor panel explains exactly
what to configure. Click **Load coffee fixture** then **Run verification** for the happy
path; use **Tamper attestation** for the refused path.
