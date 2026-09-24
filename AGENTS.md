# AGENTS.md: provenance-swarm template

## What this is

A Scaffold-HBAR external template: verifiable supply-chain provenance via a deterministic agent swarm,
anchored on Hedera. Forkable via `npm create scaffold-hbar@latest -- my-provenance-swarm --template livevnx8/scaffold-hbar-provenance-swarm --ci --solidity-framework hardhat --package-manager npm` (positional project name plus `--ci` keeps it non-interactive; explicit flags match this template's tested npm+hardhat setup).

## Layout

- `packages/swarm/`: the agent core. Pure TypeScript, no framework. `src/` holds the domain logic;
  `tests/` holds the jest suite; `scripts/demo-plan.ts` runs the offline demo.
- `packages/hardhat/`: Hardhat workspace. `contracts/ProvenanceRegistry.sol` is the on-chain anchor.
- `packages/nextjs/`: Next.js App Router frontend. Talks to the swarm through API routes.
- `template.json`: upstream Scaffold-HBAR manifest consumed by the CLI (not present in the scaffolded tree). Keep `capabilities` in sync with what actually exists in this repo.

## Commands

```bash
npm install
npm run demo                       # offline swarm demo (no credentials)
npm test                           # every workspace suite
npm test --workspace @provenance-swarm/swarm
npm test --workspace @provenance-swarm/hardhat
npm run deploy:testnet --workspace @provenance-swarm/hardhat
npm run lint                       # eslint across all workspaces
```

Clean-checkout note: the workspace packages import each other's compiled `dist/`.
On a fresh clone run `npm run build` before any workspace-scoped `npm test`; an
unbuilt tree fails with `MODULE_NOT_FOUND` on the workspace imports (see README
"Quick start").

## Conventions

- The swarm core stays **deterministic and offline**: same claim in, same verdict out. No network calls,
  no randomness, no credentials inside `packages/swarm/src`. Hedera I/O lives in `src/hedera.ts` behind
  explicit env config and is never exercised by the unit tests.
- Receipts are the trust primitive: `taskHash = sha256(canonical claim)`,
  `decisionHash` is versioned: `1.0` legacy delimiter-framed payload (verifiable,
  collision class F2/F3), `1.1` structured canonical payload (current). The verifier
  recomputes per `receipt.version`. Never change the hash construction without bumping
  `ProvenanceReceipt.version`.
- The double-verifier's two check groups (A: hash integrity, B: policy) must both pass;
  disagreement is reject-on-any-fail. The groups are not independent verifiers; both run
  inside the one `verifyProvenanceReceipt` call. Never claim multi-party independence.
- Frontend talks to Hedera through the Hashio JSON-RPC endpoints and mirror-node REST, matching the
  scaffold-hbar baseline configuration. No private keys in the browser; signing stays server-side.

## Adding a worker

- Implement `ProvenanceWorker` (`packages/swarm/src/workers.ts`): `id`, `name`,
  `specialty`, and `verify(claim: ProvenanceClaim): WorkerVerdict`.
- Workers are pure and deterministic: same claim in, same verdict out. No network,
  no credentials, no randomness inside `packages/swarm/src`. Return
  `{ workerId, name, specialty, passed, confidence, findings }`; confidence is
  clamped to 0..0.99 by the shared `verdict()` helper.
- Register in `DEFAULT_WORKERS` (`packages/swarm/src/workers.ts`), or conditionally
  in a client factory the way `ValueAttestationWorker` (`packages/oracle/src/worker.ts`)
  is added only when `claim.declaredValue` is present (`packages/oracle/src/client.ts`).
- Wiring invariant: `/api/verify` and the anchor gate's re-run must execute the
  identical worker set for a given claim. If the sets differ, the recomputed
  `decisionHash` never matches and legitimate receipts 403. `createClient()` in
  `packages/oracle/src/client.ts` is the single factory both paths use; keep it that way.

## Hash invariant

- `taskHash = sha256(canonicalize(claim))`: canonical JSON of the claim.
- `decisionHash` is versioned. `1.0` is the legacy delimiter-framed payload (the
  verifier still accepts it so existing anchors stay checkable; demonstrated
  collisions F2/F3). `1.1` is current: canonical JSON object, workers sorted by
  `workerId`, confidence as fixed-point basis points, findings as a JSON array,
  version embedded. `CURRENT_RECEIPT_VERSION = '1.1'` in
  `packages/swarm/src/receipt-builder.ts`.
- Never change the hash construction without bumping `ProvenanceReceipt.version`.
  The `HieroDoubleVerifier` recomputes per `receipt.version`.
- Findings stay human-readable but are hashed as JSON array elements in v1.1, so
  `|`/`;` inside a finding cannot change the framing.

## Env preflight

- `packages/nextjs/.env.example` is the source of truth. Copy to `.env`; never
  commit the real file.
- Before any keyed script: `HEDERA_NETWORK`, `HEDERA_OPERATOR_ID`,
  `HEDERA_OPERATOR_KEY` (transient: never logged, stored, or committed),
  `HEDERA_KEY_TYPE` (`ecdsa` for secp256k1/HashPack-style keys, `ed25519` to force;
  the SDK defaults to ED25519 and raw 32-byte keys are curve-ambiguous),
  `HEDERA_RPC_URL`, `HEDERA_REGISTRY_ADDRESS` (filled after deploy),
  `HEDERA_TEMPLATE_TOPIC_ID` (leave empty to auto-create),
  `HEDERA_CERTIFICATE_TOKEN_ID` (required for minting; not auto-created; create
  with `npm run init:token`).

## Exhibit-topic footgun

- `0.0.10569989` is the frozen Window 9 exhibit topic: read-only, forever.
  `FROZEN_EXHIBIT_TOPIC_ID` in `packages/swarm/src/hedera.ts`; template live
  paths throw rather than write there.
- Never set `HEDERA_TEMPLATE_TOPIC_ID=0.0.10569989`. `HEDERA_EXHIBIT_TOPIC_ID`
  exists for docs/UI pointers only.

## Testnet

Real testnet transactions are a bounty acceptance criterion. The operator account/key come from the
environment (see `packages/nextjs/.env.example`). Never commit them, never print them in logs.
