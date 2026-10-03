# Going to testnet

Environment variables, anchor-route access, setup steps, and error codes. Back to the [README](../README.md).

## Environment

Copy `packages/nextjs/.env.example` to `packages/nextjs/.env`:

| Variable | Required for | Notes |
|---|---|---|
| `HEDERA_OPERATOR_ID` / `HEDERA_OPERATOR_KEY` | any on-chain step | Testnet credentials only; never commit |
| `HEDERA_KEY_TYPE` | HCS + registry key parsing | `ecdsa` / `ed25519` / empty (auto). **Registry path is ECDSA-only** (ethers `Wallet`); ED25519 keys can still drive HCS/HTS via the SDK but will not sign registry txs. |
| `HEDERA_NETWORK` | anchoring | `testnet` (default) or `mainnet` |
| `HEDERA_TEMPLATE_TOPIC_ID` | live HCS anchors | auto-created if absent; **must not** be `0.0.10569989` |
| `HEDERA_PROVENANCE_TOPIC_ID` | legacy alias | still honoured if `HEDERA_TEMPLATE_TOPIC_ID` is unset |
| `HEDERA_EXHIBIT_TOPIC_ID` | docs only | defaults to frozen Window 9 topic `0.0.10569989` (read-only) |
| `HEDERA_CERTIFICATE_TOKEN_ID` | NFT mint | **must be set**: create once with `npm run init:token` (writes this var), or out-of-band / via `packages/swarm/scripts/mint-genesis-certificate.ts`; **not** auto-created by `/api/anchor`. If unset, `mintCertificate` fails with "No certificate token configured" and the NFT step reports that error |
| `HEDERA_REGISTRY_ADDRESS` | contract anchor + receipt checks | from `deploy:testnet` |
| `HEDERA_RPC_URL` | contract calls | defaults to Hashio testnet |
| `HEDERA_MIRROR_ALLOWED_PAYERS` | `/api/mirror-verify` | Comma-separated payer allowlist. Default: the team operators `0.0.9034044,0.0.10685865`. Forks running their own operator set their own account(s) here |
| `HEDERA_MIRROR_TOPIC_ID` | `/api/mirror-verify` | Receipt topic to trust. Default: `HEDERA_TEMPLATE_TOPIC_ID` if set, else `0.0.10681528` |
| `ANCHOR_API_TOKEN` | `POST /api/anchor` | **Required to anchor.** 16+ characters (e.g. `openssl rand -hex 24`). Unset or short → the route answers 503 and writes nothing. Callers send `Authorization: Bearer <token>`; the UI asks for it. Never exposed by `/api/config` |
| `ANCHOR_API_ENABLED` | public deployments | `false` disables `/api/anchor` entirely (503) even with a token, for verify-only deployments. `true` never bypasses a missing token |

## Setup steps

**Prerequisites.** Node >= 20.18.3. First `npm install` on a clean machine can take **~9 minutes**. A Hedera testnet account funded from the
[faucet](https://portal.hedera.com) (a few testnet HBAR covers the topic
create, registry deploy, HCS anchors, and NFT mint), the certificate collection created via `npm run init:token` (step 3), and the registry
deployed before you anchor (step 4). ECDSA operator keys (e.g. HashPack-style accounts)
need `HEDERA_KEY_TYPE=ecdsa` in `packages/nextjs/.env` (the registry path is
ECDSA-only via ethers); raw 32-byte keys cannot be told apart by inspection and
the SDK defaults to ED25519.

**If anchoring fails**, the API returns a plain reason. Incomplete provenance
chains are not accepted as finalized receipts:

- **503**: anchoring disabled (`ANCHOR_API_TOKEN` unset or too short, or
  `ANCHOR_API_ENABLED=false`). **401**: missing or wrong `Authorization: Bearer` token.
- **403**: forged receipt, or committed Chainlink evidence that does not match
  `getRoundData` on the pinned feed (or is older than 24 hours; re-run verification).
- **400**: bad request, unusable key, or exhibit topic pointed at live path
  (`Live topic is set to the frozen Window 9 exhibit topic`,
  `HEDERA_OPERATOR_KEY is not a usable private key for the registry path`).
- **500**: server misconfig (`Hedera operator not configured`).
- **409**: duplicate registry anchor (`This claim is already anchored on-chain`), detected
  with a registry read before any write.
- **502**: partial or all-failed HCS / registry / NFT stages (`{ ok: false }` plus
  per-stage results). A skipped NFT stage (verdict-not-verified) is not a failure.
  There is no `no-registry` skip anymore: anchoring without `HEDERA_REGISTRY_ADDRESS`
  fails closed with 400 before any write, because one-anchor-per-claim is a
  registry-present property.
- `No certificate token configured` surfaces as a failed NFT stage (502 when the
  mint was attempted); run `npm run init:token` (or set `HEDERA_CERTIFICATE_TOKEN_ID`
  out-of-band). The anchor path does not auto-create the NFT collection.
- Registry path is **ECDSA-only**; set `HEDERA_KEY_TYPE=ecdsa` for HashPack-style keys.

1. Create a testnet account via the [Hedera Portal](https://portal.hedera.com) and fund it from the faucet.
2. Copy `packages/nextjs/.env.example` to `packages/nextjs/.env`, add your operator
   credentials, and set `ANCHOR_API_TOKEN` (16+ characters; you paste it into the anchor
   panel). Without it the anchor route stays disabled.
3. Create the HTS certificate NFT collection and write `HEDERA_CERTIFICATE_TOKEN_ID`:
   `HEDERA_OPERATOR_ID=… HEDERA_OPERATOR_KEY=… npm run init:token -- --env packages/nextjs/.env`
   (`--dry-run` prints the collection plan without submitting or writing). This is the last
   setup step between the offline demo and live testnet NFT mint. `/api/anchor` does not
   auto-create the collection.
4. Deploy the registry: `npm run deploy:testnet --workspace @provenance-swarm/hardhat`
5. Run the full claim flow in the frontend: verify → anchor → verify on mirror node.
6. Add your transaction links to [`testnet-evidence.md`](./testnet-evidence.md).
