# AGENTS.md — provenance-swarm template

## What this is

A Scaffold-HBAR external template: verifiable supply-chain provenance via a deterministic agent swarm,
anchored on Hedera. Forkable via `npm create scaffold-hbar@latest -- --template livevnx8/scaffold-hbar-provenance-swarm`.

## Layout

- `packages/swarm/` — the agent core. Pure TypeScript, no framework. `src/` holds the domain logic;
  `tests/` holds the jest suite; `scripts/demo-plan.ts` runs the offline demo.
- `packages/contracts/` — Hardhat workspace. `contracts/ProvenanceRegistry.sol` is the on-chain anchor.
- `packages/nextjs/` — Next.js App Router frontend. Talks to the swarm through server actions / API routes.
- `template.json` — the scaffold-hbar manifest. Keep `capabilities` in sync with what actually exists.

## Commands

```bash
yarn install
yarn demo                        # offline swarm demo (no credentials)
yarn test                        # every workspace suite
yarn workspace @provenance-swarm/swarm test
yarn workspace @provenance-swarm/contracts test
yarn workspace @provenance-swarm/contracts deploy:testnet
```

## Conventions

- The swarm core stays **deterministic and offline**: same claim in, same verdict out. No network calls,
  no randomness, no credentials inside `packages/swarm/src` — Hedera I/O lives in `src/hedera.ts` behind
  explicit env config and is never exercised by the unit tests.
- Receipts are the trust primitive: `taskHash = sha256(canonical claim)`,
  `decisionHash = sha256(taskHash + worker results)`. Never change the hash construction without bumping
  `ProvenanceReceipt.version`.
- The double-verifier's two passes (A: hash integrity, B: policy) must stay independent — one shared
  helper computing both would defeat the point.
- Frontend talks to Hedera through the Hashio JSON-RPC endpoints and mirror-node REST, matching the
  scaffold-hbar baseline configuration. No private keys in the browser; signing stays server-side.

## Testnet

Real testnet transactions are a bounty acceptance criterion. The operator account/key come from the
environment (see `packages/nextjs/.env.example`) — never commit them, never print them in logs.
