# CLI scaffold gate — 2026-09-24

The mechanical bounty gate: does `npm create scaffold-hbar` produce a working
tree from this template? Run from a clean scratch directory (no repo state).

## Run 1 — branch tip `301d1ee` (pre-polish)

```bash
npm exec --yes create-scaffold-hbar@latest -- out -y \
  --template "livevnx8/scaffold-hbar-provenance-swarm#feat/multi-ledger-evidence-phase3" \
  --solidity-framework hardhat --package-manager npm \
  --skip-install --skip-hedera-skills --ci
cd out
npm install
npm run lint
npm run build
npm test
npm start  # boot probe: one HTTP GET /
```

Notes: `create-scaffold-hbar@latest` resolves to `0.4.0` (identical to the
`@0.4.0` pin previously in the README; docs now standardize on `@latest`).
`--skip-hedera-skills` skips the optional Hedera Skills marketplace install so
the gate measures the template itself. `#branch` suffix resolves the PR branch
tarball via giget (verified: scaffolded tree contains
`packages/anchors/scripts/`).

Results (real exit codes, no pipe masking):

| Step | Result |
|---|---|
| Scaffold | exit 0 |
| `npm install` | exit 0, 0 errors |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0 |
| `npm test` | exit 0 — anchors 33, hardhat 5, nextjs 28, oracle 47, swarm 41, init-token 83 |
| Boot (`npm start` + HTTP GET /) | HTTP 200 |

Full logs: retained by the operator for this run.

## Run 2 — pending

Re-run against the final tip (judge-fix commits: `packages/hardhat` rename,
registry operator hardening, in-app attestation checker, docs polish) after
the branch is pushed. The CLI resolves the template from the pushed ref, so
the re-run must follow the push.
