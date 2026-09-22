# Phase 2 — Chainlink Value Attestation: Integration Design

Status: **design for review** — no code yet. Designed against public main `6bfc688`
(registry-required anchoring, receipt v1.1, anchor gate). Reconcile against the v1.2
reference bundle when it arrives; open questions are flagged **[v1.2-check]**.

---

## 0. The one constraint that shapes everything

`gateReceipt` (`packages/nextjs/lib/anchorGate.ts`) does not just re-verify the
receipt's hashes — it **re-runs the swarm**:

```ts
const { receipt: recomputed } = new ProvenanceClient().verifyClaim(claim);
// requires recomputed.decisionHash === receipt.decisionHash
```

`ProvenanceWorker.verify(claim)` is **synchronous and deterministic** — same claim
in, same verdict out, no network. A naive oracle worker that reads live feeds inside
`verify()` breaks the gate twice over:

1. It is async — the whole worker/coordinator/gate call chain would have to go async.
2. Worse: even async, a second live read at anchor time returns **different round IDs
   and answers** → different findings → different `decisionHash` → the gate 403s its
   own legitimate receipt.

**Resolution: evidence-in-claim.** The live read happens once, in an async
attestation step *before* the swarm runs. Its output — an `OracleEvidence` object —
is attached to the claim. The oracle worker itself stays pure/sync: it evaluates the
claim's declared value against the embedded evidence. The gate re-run sees the same
evidence in the posted claim and reproduces the identical `decisionHash`.

This also gives the strongest tamper-evidence available in the current construction:
`taskHash = sha256(canonicalize(claim))` binds the evidence itself.

---

## 1. `packages/oracle/` shape

Dependency direction stays clean: `swarm` (pure, sync, no network) ← `oracle`
(async attestation + sync worker + verifier) ← `nextjs`.

```
packages/oracle/
  src/
    types.ts        — DeclaredValue, OracleEvidence, FeedReading, OracleCheckReport
    feeds.ts        — feed registry: pair → {address, decimals} for HBAR/ETH/BTC
    reader.ts       — async Chainlink reader via Hashio JSON-RPC (ethers, read-only)
    compositor.ts   — multi-feed compositor: normalize answers, compute USD value
    attestation.ts  — attestClaimValue(claim) → claim with oracleEvidence attached
    worker.ts       — OracleValueWorker implements ProvenanceWorker (sync)
    verifier.ts     — verifyOracleEvidence: two check groups, reject-on-any-fail
    fixture.ts      — fixtureOracleEvidence(): pinned recorded round data (offline)
    index.ts        — exports
  tests/            — compositor, worker, verifier, live-read (skippable), framing
  scripts/
    demo-plan.ts    — 4-act demo: GREEN / GREEN / RED-attestation / RED-value
```

### 1.1 Feed registry (`feeds.ts`)

Versioned constant, not config-by-env — the worker must be able to check that
evidence points at *the real feeds*, not attacker-chosen contracts:

```ts
export const CHAINLINK_FEEDS_TESTNET = {
  'HBAR/USD': { address: '0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a', decimals: 8 },
  'BTC/USD':  { address: '0x058fE79CB5775d4b167920Ca6036B824805A9ABd', decimals: 8 },
  'ETH/USD':  { address: '0xb9d461e0b962aF219866aDfA7DD19C52bB9871b9', decimals: 8 },
} as const;
```

Addresses per the official docs.hedera.com table. **[v1.2-check]** — a community
plugin lists a different set (`0xfad5…`, `0xf600…`, `0x9e75…`); likely a different
adapter deployment. Confirm which set v1.2 used before freezing the constant.

### 1.2 Reader (`reader.ts`)

- `ethers.JsonRpcProvider(HEDERA_RPC_URL || https://testnet.hashio.io/api)`
- `latestRoundData()` per feed → `{roundId, answer, updatedAt, decimals}`
- `getRoundData(roundId)` for the third-party re-check path (historical rounds are
  immutable on-chain — this is what makes the evidence auditable after the fact)
- Read-only. No keys, no signer, no writes. Provider only.

### 1.3 Compositor (`compositor.ts`)

- Normalizes each feed answer to a fixed-point USD rate (respecting `decimals`).
- `compositeUsd(declaredValue, readings)` → the feed-implied USD value of the
  declared amount in its declared currency.
- All arithmetic on integer/bigint or fixed-point — **no floats in any hashed or
  compared path** (same discipline as `confidenceBp` in v1.1).
- Cross-feed sanity: where a synthetic path exists (e.g. implied rates across
  feeds), the compositor can flag feed disagreement — secondary check, not required
  for the band rule. **[v1.2-check]** if v1.2's compositor did cross-rate
  validation, port it; otherwise keep single-path conversion per currency.

### 1.4 Worker (`worker.ts`)

`OracleValueWorker implements ProvenanceWorker` — `id: 'oracle-value'`,
`specialty: 'value'`. Pure and synchronous like the other three:

- `claim.declaredValue` absent → **pass, low confidence**, finding:
  "no declared value — oracle check skipped" (backward compat: pre-Phase-2 claims
  and receipts still verify).
- `declaredValue` present, `oracleEvidence` absent/malformed → **fail closed**:
  "declared value present but oracle evidence missing/invalid".
- Both present → run `verifyOracleEvidence` (§1.5); verdict = all checks ok.
- Findings carry the human-readable evidence summary:
  `HBAR/USD 0x59bC…B4a round 18446744073709562931 answer 9980000 (8dp) → $0.0998/HBAR`.

### 1.5 Verifier (`verifier.ts`)

`verifyOracleEvidence(claim) → { ok, checks }` — mirrors `HieroDoubleVerifier`'s
two-group structure, **reject-on-any-fail**:

- **Pass A — evidence integrity:** every feed entry's address is in the registry
  (no substitute feeds); `roundId`, `answer`, `decimals`, `updatedAt` well-formed;
  `compositeUsd` recomputes exactly from the entries (canonical fixed-point path).
- **Pass B — policy:** `declaredValue` well-formed (amount > 0, currency ∈
  {HBAR, ETH, BTC}, usdEquivalent > 0); ratio `declaredUsd / compositeUsd` within
  **[0.5, 2.0]** inclusive.

An async companion `verifyOracleEvidenceOnChain(claim)` (used by the optional
`/api/oracle-verify` endpoint) additionally re-reads `getRoundData(roundId)` per
entry and confirms the recorded answer matches the on-chain round — this is the
third-party audit path, and it is *additive*: the sync core never needs it.

### 1.6 Receipt model

**No new receipt field. No version bump. Receipt stays `1.1`.**

- The oracle verdict rides as a **fourth entry in `results[]`**
  (`workerId: 'oracle-value'`). `verdictFor` already does the right thing:
  4/4 pass → `verified`; oracle fail → `needs_review` (the RED-value path).
- Feed details live in **`claim.oracleEvidence`** → bound by `taskHash`.
- The human-readable feed summary lives in the worker's `findings` → bound by
  `decisionHash` (v1.1 hashes findings as JSON array elements — framing-safe).
- `worker_quorum` check (`results.length > 0`, well-formed entries) unaffected.
- Old 3-worker v1.1 receipts still verify: `verifyProvenanceReceipt` recomputes
  `decisionHash` from `receipt.results` as-stored, not from a fresh swarm run.
  Only `gateReceipt` re-runs the swarm — and only for *new* anchors.

---

## 2. Claim schema

```ts
export interface DeclaredValue {
  /** Decimal string, e.g. "12000" — string, not number (no float in hashed data). */
  amount: string;
  currency: 'HBAR' | 'ETH' | 'BTC';
  /** Claimant-declared USD equivalent, decimal string e.g. "1200". */
  usdEquivalent: string;
}

export interface FeedReading {
  pair: string;            // 'HBAR/USD'
  address: string;         // feed contract — must match registry
  roundId: string;         // uint80 as decimal string
  answer: string;          // raw int256 answer as decimal string
  decimals: number;
  updatedAt: number;       // unix seconds from the round
}

export interface OracleEvidence {
  readings: FeedReading[];          // one per feed consulted
  compositeUsd: string;             // fixed-point USD value of declared amount
  computedAt: number;               // attestation time (freshness judged vs. this)
}

// ProvenanceClaim gains two optional fields:
declaredValue?: DeclaredValue;
oracleEvidence?: OracleEvidence;
```

**Why the dual declaration (amount + usdEquivalent):** the band rule needs a
reference. The claimant asserts both the native amount and its USD equivalent; the
oracle recomputes the USD value from the live feed and requires the declared
equivalent within 0.5×–2× of computed. Tamper either side → ratio leaves the band
→ genuine refusal. The wide band is deliberate: a static fixture stays GREEN across
normal volatility (HBAR would need a >2× move to break it), while a 10× inflation
still fails. **[v1.2-check]** — confirm v1.2's field shape; if it declared only
`{amount, currency}` and derived the reference differently, reconcile here.

`declaredValue` is the fourth claim dimension (origin, custody, documents, value).
`oracleEvidence` is not claim semantics — it is the attestation artifact, and it
lives on the claim purely so `taskHash` binds it and the gate re-run can see it.

---

## 3. Receipt binding — exact mechanics

| Data | Lives in | Bound by |
|---|---|---|
| `declaredValue` (amount, currency, usdEquivalent) | `claim.declaredValue` | `taskHash` |
| Feed addresses, round IDs, answers, composite | `claim.oracleEvidence` | `taskHash` |
| Oracle pass/fail + confidence + findings | `results[3]` (`oracle-value`) | `decisionHash` |
| Verdict (`verified`/`needs_review`) | `receipt.verdict` | `decisionHash` + registry |

Tamper paths closed:

- Change declared value after verify → `taskHash` changes → gate 403.
- Swap in fabricated evidence → `taskHash` changes → gate 403; also Pass A fails
  (composite won't recompute, or feed address not in registry).
- Fabricate evidence that *does* pass the band (attacker picks a fake round with a
  convenient answer) → passes the sync checks, but the evidence names a real feed +
  real roundId; `getRoundData(roundId)` on-chain exposes the lie. Same trust model
  as the rest of the template: receipt is tamper-evident, evidence is auditable.
- Reuse *old but real* evidence (stale price) → attestation-time freshness check
  refuses stale rounds; post-anchor, the HCS consensus timestamp is a fixed
  on-chain reference against which `evidence.computedAt`/`updatedAt` can be judged.

---

## 4. Request flow changes

```
POST /api/verify
  claim in → if claim.declaredValue present:
               enriched = await attestClaimValue(claim)   // oracle pkg, live read
             else enriched = claim                        // offline-safe
           → createClient().verifyClaim(enriched)
           → return { receipt, report, claim: enriched }  // claim now echoed back

POST /api/anchor   (unchanged signature: {claim, receipt})
  → gateReceipt(receipt, claim)   // claim carries oracleEvidence →
                                   // re-run reproduces identical decisionHash
  → HCS / registry / NFT writes   // unchanged
```

`createClient()` — new shared factory in `packages/nextjs/lib` (or exported from
oracle): `AgentRegistry.withDefaults()` + `register(new OracleValueWorker())`.
**Both** `/api/verify` and `anchorGate` must use it — if the gate's re-run uses a
different worker set than the verify path, `decisionHash` never matches. This is
the single most important wiring detail in the port.

**Feed-read failure semantics (fail closed, explicit):** if `attestClaimValue`
throws for any reason — feed unreachable, malformed round data, stale round at
read time — `/api/verify` returns `502` with a clear error ("oracle feeds
unreachable" / the attestation error). **No receipt is produced and no
partially-enriched claim is returned.** The client cannot reach the gate with a
claim the gate would later 403, because there is nothing to submit. Claims
without `declaredValue` never enter the oracle path and verify offline exactly
as today. Attestation is never silently skipped for a claim that declares value.

**Evidence freshness (explicit scope):** the sync path performs **no wall-clock
age check** — deliberately. A `Date.now() - computedAt` check inside the worker
or verifier would make the gate non-deterministic across the verify→anchor gap
(the same failure class as live re-reading). Freshness is enforced at the only
point where a clock read is honest:

- **Attestation time (async):** `attestClaimValue` refuses rounds whose
  `updatedAt` is older than the feed's heartbeat (per-feed constant, ~1h for
  testnet crypto feeds). Stale evidence is never produced.
- **Pass B (sync, deterministic):** checks only committed-value consistency —
  `evidence.computedAt >= max(readings[].updatedAt)` (evidence cannot predate
  its own newest round). All inputs are bound by `taskHash`; the check
  recomputes identically forever.
- **Audit path (post-anchor):** the HCS consensus timestamp is a fixed on-chain
  reference; auditors judge `computedAt`/`updatedAt` against it. Staleness
  relative to anchor time is an audit finding, not a gate condition.

---

## 5. UI

- **`ClaimForm`**: new "Declared value" row — amount input, currency select
  (HBAR/ETH/BTC), USD-equivalent input. Fixture button loads a claim whose
  declared value passes the band. A second tamper button ("Tamper value", e.g.
  10× the usdEquivalent) alongside "Tamper attestation" for the RED-value demo.
- **`WorkerResults`**: the fourth worker card renders automatically (it maps
  `results[]`). Under the oracle card, an evidence sub-panel lists each feed:
  pair, contract address, round ID, raw answer, implied USD rate — sourced from
  the enriched claim returned by `/api/verify`.
- **`/api/config`**: expose feed registry + attestation status so the UI can show
  "oracle: testnet live" vs "oracle: unavailable".

---

## 6. Rule

**0.5 ≤ declaredUsdEquivalent / compositeUsd ≤ 2.0**, inclusive, computed in
fixed-point. Outside → worker fails → `needs_review`.

**RED-value semantics (confirmed against current main):** a `needs_review`
receipt **anchors** — HCS + registry record the truthful refusal; the NFT stage
is skipped. This is not a new path: `app/api/anchor/route.ts` already implements
it (`receipt.verdict !== 'verified'` → `nft: { skipped: 'verdict-not-verified' }`,
HCS and registry stages proceed). The refusal on the ledger is the point —
identical to the existing RED-attestation semantics. RED-value inherits it with
zero route changes. **[v1.2-check]** — confirm v1.2 behaved the same way; if it
refused RED-value at the gate instead, flag the divergence before porting.

---

## 7. Test plan

`packages/oracle/tests/`:

- **Compositor:** decimal normalization (8dp answers), conversion per currency,
  band edges at exactly 0.5× and 2.0× (inclusive), non-numeric/negative/zero
  amounts rejected.
- **Worker:** absent `declaredValue` → pass-skip; `declaredValue` without
  evidence → fail closed; malformed evidence → fail; in-band → pass; out-of-band
  → fail; findings contain feed address + roundId.
- **Verifier:** Pass A and Pass B independent; reject-on-any-fail; composite
  recompute catches edited answers; unknown feed address fails Pass A.
- **Gate round-trip (the critical test):** verify → anchor body → `gateReceipt`
  re-run reproduces identical `taskHash`/`decisionHash`/`verdict`. Without this,
  the integration is broken by construction.
- **Tampered-value refusal:** fixture with 10× `usdEquivalent` → `needs_review`,
  oracle worker named as the failure, gate 403s a forged `verified` receipt.
- **F2/F3 regression for compositor framing:** evidence canonicalized as
  structured JSON only; crafted pair strings / findings containing `:`, `|`, `;`
  cannot shift field boundaries; same collision battery as the v1.1 fix.
- **Live read-only test** (skippable offline): `latestRoundData` on all three
  testnet feeds returns well-formed roundId/answer/updatedAt; `getRoundData`
  round-trips a recorded round. No keys, no writes.
- **Full gate:** scaffold → install → lint → build → boot → demo → test counts
  all stay green; demo gains the fourth act (RED-value) using pinned
  `fixtureOracleEvidence()` so it runs offline.

**Demo determinism (explicit):** the demo path uses **pinned evidence only and
never live re-attests**. `demo-plan.ts` constructs the claim with
`fixtureOracleEvidence()` (recorded real round data from the testnet gate run)
already attached, then calls `client.verifyClaim(claim)` directly —
`attestClaimValue` is never invoked, no network is touched. Same claim + same
pinned evidence → identical `taskHash`/`decisionHash` on every run, so the demo
cannot 403 or drift against itself. `/api/fixture` returns `declaredValue`
*without* `oracleEvidence`; live attestation happens only inside `/api/verify`.

---

## 8. Cut list — ordered, per "cut the phase, not the gate"

1. **Oracle evidence sub-panel in UI** — worker card still shows pass/fail +
   findings; feed details remain in the claim JSON.
2. **`/api/oracle-verify` endpoint** — evidence stays bound and auditable;
   third parties can re-read rounds manually.
3. **Multi-feed → single-feed** — restrict `currency` to `HBAR` only; compositor
   collapses to one reader path. Band rule and binding unchanged.
4. **Live attestation in `/api/verify`** — fall back to pinned
   `fixtureOracleEvidence()` only; worker, binding, and refusal path all still
   real. Demo and tests unaffected. *This is the last cut before the phase.*
5. **Cut the phase.** If even the minimal worker + evidence-in-claim threatens
   the Phase 1 gate, Phase 2 defers wholesale. The gate is never the sacrifice.

---

## 9. Explicit non-goals / guardrails

- No keys, no chain writes — oracle reads are provider-only via Hashio.
- Nothing pushed; changes land via the PR path only.
- Phase 1 gate stays green at every step: scaffold, install, lint, build, boot,
  demo, and the recorded testnet anchors (registry `0.0.10658175`, topic
  `0.0.10658200`, NFT `0.0.10653074` serial 2).
- `packages/swarm` stays pure/sync/no-network — the async boundary lives entirely
  in `packages/oracle`'s attestation step.
