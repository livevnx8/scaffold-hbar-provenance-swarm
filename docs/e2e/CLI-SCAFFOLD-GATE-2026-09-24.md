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

## Run 2 — branch tip `94557c0` (final polish stack, pushed 2026-09-24)

Ran 2026-09-24 ~08:50 EDT from a fresh scratch directory
(`~/workspace/scratch/gate-run2`, removed afterward), against the pushed
branch ref (verified `origin/feat/multi-ledger-evidence-phase3` =
`94557c0542c13857f859dbb28212f92d601db3a4` before starting).

```bash
npm create scaffold-hbar@latest -- \
  --template "livevnx8/scaffold-hbar-provenance-swarm#feat/multi-ledger-evidence-phase3" \
  --ci --skip-install --skip-hedera-skills \
  --package-manager npm --solidity-framework hardhat scaffolded
cd scaffolded
npm install          # TMPDIR pointed under $HOME; /tmp is a 512M tmpfs
npm run lint
npm run build
npm test
npm run start &      # boot probe: one HTTP GET /
```

Finding: `npx -y create-scaffold-hbar@latest -- <flags>` silently dropped every
flag after `--` in this environment (the CLI fell through to its interactive
"Which starter template?" prompt, even for `--version`). The README-documented
`npm create scaffold-hbar@latest -- <flags>` form forwarded all flags and
scaffolded with exit 0. Verified the scaffolded tree contains the new
`packages/hardhat` layout, confirming the template resolved the pushed
`94557c0` tip.

Results (real exit codes, no pipe masking):

| Step | Result |
|---|---|
| Scaffold | exit 0 |
| `npm install` | exit 0 (1,155 packages) |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0 |
| `npm test` | exit 0 — anchors 33/33, hardhat 9/9, nextjs 28/28, oracle 47/47, swarm 41/41, init-token 83/83 |
| Boot (`npm run start` + HTTP GET /) | HTTP 200 |

Hardhat grew from 5 to 9 tests since run 1 (the 4 operator-access-control
tests). All other suites hold their run-1 counts. **Gate: GREEN on the final
tip.**
