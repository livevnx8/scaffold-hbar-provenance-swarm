# Provenance Swarm: a Scaffold-HBAR template


> Node **>= 20.18.3**. First `npm install` on a clean machine can take **~9 minutes**.


Verifiable supply-chain provenance on Hedera. A deterministic agent swarm checks a product's
origin attestation, custody chain, and document hashes; the coordinator binds the verdicts
into a tamper-evident receipt; the receipt can be anchored on Hedera (HCS topic + registry
contract) and a provenance-certificate NFT (HTS) is minted for verified claims. A Next.js
frontend walks anyone through claim to verification to receipt to anchoring, and a third
party can re-check a receipt against the chain or the mirror node without trusting the
verifier.


Scaffold it in one command:


```bash
npm create scaffold-hbar@latest -- --template livevnx8/scaffold-hbar-provenance-swarm --package-manager npm --solidity-framework hardhat
```


The default branch is `main`, so the bare `--template owner/repo` form resolves the
template tarball directly. Pass `--package-manager npm` and `--solidity-framework hardhat`
so defaults do not demand missing Yarn or attempt Foundry validation.


## Why it matters


The swarm pattern separates independently testable verification responsibilities while keeping the final provenance receipt deterministic and reproducible.


### What this does not prove


- **Not real-world truth.** A self-consistent fabricated claim (hashes that recompute and
  match the supplied fields) gets a full GREEN. The system proves internal consistency of
  the fields you supply, not signer identity, source authentication, document retrieval, or
  custody attestation from the outside world.
- **Mirror confirmation is byte equality.** `verifyHcsAnchorOnMirror` checks that the HCS
  payload's `decisionHash` equals the caller-provided expected hash. It does not
  independently reconstruct the claim or recompute provenance.
- **Document hashes are shape-checked only.** The Document Hash Verifier accepts lowercase
  64-char hex strings. It never obtains or hashes document bytes, so it does not authenticate
  document contents.


Supply-chain claims are easy to forge and hard to re-check. This template turns a product
claim into a tamper-evident receipt: the same claim always yields the same worker verdicts,
hashes bind the claim to those verdicts, and Hedera anchors make the receipt independently
replayable. A forged "verified" receipt is refused at the server gate before any HCS,
registry, or NFT write.


## What `npm run demo` shows (~30 seconds after install)


Root script (do **not** use a workspace-scoped demo command; the swarm package exposes
`demo:plan`, and the root wires it):


```bash
npm run demo
```


You should see **GREEN / GREEN / RED**:


1. **GREEN** - valid coffee fixture verifies.
2. **GREEN** - a second valid lot verifies.
3. **RED** - a tampered attestation is refused; the receipt truthfully records
   `needs_review` and the failing worker is named.


The demo also prints the recorded-anchor evidence block (historical HCS seq 2 + NFT serial
#1). UI twin: load the coffee fixture, verify, then click **Tamper attestation** and verify
again to see the refused claim explain itself.


## Quick start (no Hedera account needed)


```bash
npm install          # ~9 minutes on a clean machine; Node >= 20.18.3
npm run build        # builds swarm (dist/) then nextjs; required before `dev`
npm run demo         # GREEN / GREEN / RED offline teach-in
npm test             # workspace unit tests, all offline
```


Run the frontend:


```bash
npm run build        # if you have not already
