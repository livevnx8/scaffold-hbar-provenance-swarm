# AGENTS.md: provenance-swarm template

## What this is

A Scaffold-HBAR external template: verifiable supply-chain provenance via a deterministic agent swarm,
anchored on Hedera. Forkable via `npm exec --yes create-scaffold-hbar@latest -- --template livevnx8/scaffold-hbar-provenance-swarm --solidity-framework hardhat --package-manager npm` (explicit flags match this template's tested npm+hardhat setup; `npm exec` form survives the CLI's markdown command rewrite).

## Layout

- `packages/swarm/`: the agent core. Pure TypeScript, no framework. `src/` holds the domain logic;
  `tests/` holds the jest suite; `scripts/demo-plan.ts` runs the offline demo.
- `packages/contracts/`: Hardhat workspace. `contracts/ProvenanceRegistry.sol` is the on-chain anchor.
- `packages/nextjs/`: Next.js App Router frontend. Talks to the swarm through API routes.
- `template.json`: upstream Scaffold-HBAR manifest consumed by the CLI (not present in the scaffolded tree). Keep `capabilities` in sync with what actually exists in this repo.

## Commands

```bash
npm install
npm run demo                       # offline swarm demo (no credentials)
npm test                           # every workspace suite
npm test --workspace @provenance-swarm/swarm
npm test --workspace @provenance-swarm/contracts
npm run deploy:testnet --workspace @provenance-swarm/contracts
npm run lint                       # eslint across all workspaces
```

## Conventions

- The swarm core stays **deterministic and offline**: same claim in, same verdict out. No network calls,
  no randomness, no credentials inside `packages/swarm/src`. Hedera I/O lives in `src/hedera.ts` behind
  explicit env config and is never exercised by the unit tests.
- Receipts are the trust primitive: `taskHash = sha256(canonical claim)`,
  `decisionHash` is versioned — `1.0` legacy delimiter-framed payload (verifiable,
  collision class F2/F3), `1.1` structured canonical payload (current). The verifier
  recomputes per `receipt.version`. Never change the hash construction without bumping
  `ProvenanceReceipt.version`.
- The double-verifier's two check groups (A: hash integrity, B: policy) must both pass;
  disagreement is reject-on-any-fail. The groups are not independent verifiers — both run
  inside the one `verifyProvenanceReceipt` call. Never claim multi-party independence.
- Frontend talks to Hedera through the Hashio JSON-RPC endpoints and mirror-node REST, matching the
  scaffold-hbar baseline configuration. No private keys in the browser; signing stays server-side.

## Testnet

Real testnet transactions are a bounty acceptance criterion. The operator account/key come from the
environment (see `packages/nextjs/.env.example`). Never commit them, never print them in logs.
