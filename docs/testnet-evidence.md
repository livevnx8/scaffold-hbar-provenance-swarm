# Testnet evidence

Every testnet transaction, topic, token, and contract referenced by this repo, newest first, with superseded instances labelled. Back to the [README](../README.md).

## Primary links

- **Live registry (post-hardening, 2026-09-24):** deploy transaction
  [`0xdc4b903e…9eec5d`](https://hashscan.io/testnet/transaction/0xdc4b903ea7385bede39dc433023ebb0dfb44d50dfcf10c2404b3250b5e9eec5d),
  contract [`0xd564579399aAc654CcB5C5F768679471aa795f55`](https://hashscan.io/testnet/contract/0xd564579399aAc654CcB5C5F768679471aa795f55)
  (`0.0.10702506`). Record: [`e2e/REGISTRY-REDEPLOY.md`](./e2e/REGISTRY-REDEPLOY.md).
- **Receipt topic:** [`0.0.10681528`](https://hashscan.io/testnet/topic/0.0.10681528).
- **Certificate collection (PROVC):** [`0.0.10653074`](https://hashscan.io/testnet/token/0.0.10653074).
- **Most recent HCS anchor + NFT mint** (2026-09-23, operator `0.0.9034044`, topic
  `0.0.10681528`): HCS seq 7
  [`0.0.9034044@1790201046.181965496`](https://hashscan.io/testnet/transaction/0.0.9034044@1790201046.181965496),
  NFT serial 4 mint
  [`0.0.9034044@1790201052.128733096`](https://hashscan.io/testnet/transaction/0.0.9034044@1790201052.128733096).

## Operator allowlist and topic

The team operator allowlist is **`0.0.9034044`** and **`0.0.10685865`**; the receipt topic is
**`0.0.10681528`**. These are the defaults of `/api/mirror-verify`
(`HEDERA_MIRROR_ALLOWED_PAYERS`, `HEDERA_MIRROR_TOPIC_ID`). The topic has no submit key, so a
message counts only if its `payer_account_id` is on this list.

## All anchors on the live topic (2026-09-23)

The registry calls in these runs went to the pre-hardening registry `0x5Ad5…`
(**superseded** by the 2026-09-24 redeploy above). The HCS messages and NFT mints are
unaffected.

Operator `0.0.9034044` (evidence: [`e2e/E2E-TESTNET-2026-09-23.md`](./e2e/E2E-TESTNET-2026-09-23.md)):

- HCS seq 7 (verified):
  [`0.0.9034044@1790201046.181965496`](https://hashscan.io/testnet/transaction/0.0.9034044@1790201046.181965496);
  registry `anchorReceipt`
  [`0x07daf909…febc415a`](https://hashscan.io/testnet/transaction/0x07daf9091a827bd1f620b4925354e093073c4c1408cfd59635460351febc415a);
  NFT serial 4
  [`0.0.9034044@1790201052.128733096`](https://hashscan.io/testnet/transaction/0.0.9034044@1790201052.128733096)
- HCS seq 8 (verified value claim):
  [`0.0.9034044@1790201053.821201862`](https://hashscan.io/testnet/transaction/0.0.9034044@1790201053.821201862);
  NFT serial 5
  [`0.0.9034044@1790201065.958253903`](https://hashscan.io/testnet/transaction/0.0.9034044@1790201065.958253903)
- HCS seq 9 and 10 (`needs_review`, no mint):
  [`0.0.9034044@1790201064.269125956`](https://hashscan.io/testnet/transaction/0.0.9034044@1790201064.269125956),
  [`0.0.9034044@1790201073.985532696`](https://hashscan.io/testnet/transaction/0.0.9034044@1790201073.985532696)

Operator `0.0.10685865` (HCS seq 3–6): registry `anchorReceipt`
[`0x4bf78ca7…dbe9273be`](https://hashscan.io/testnet/transaction/0x4bf78ca72bdfd07811828b95845ed447ec129cae396db0e320740bfdbe9273be).

## Superseded instances

- **2026-09-21 run:** registry `0xC9231fa293113991285ed41b60906Dfb0E2CDC01`, topic
  `0.0.10649257`, PROVC token `0.0.10649238`. Table below.
- **Pre-hardening registry:** `0x5Ad54d39d860Cb2c2c6A27c787eead7358137e1a` (used by the
  2026-09-23 runs).
- **Historical exhibit:** frozen topic `0.0.10569989`, read-only; see
  [`history/window-9/appendix.md`](./history/window-9/appendix.md).

## Check it yourself without our server

```bash
curl -s https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10681528/messages/7
```

Accept a message only if `payer_account_id` is `0.0.9034044` or `0.0.10685865`. Then
base64-decode `message` and compare its `decisionHash` with the receipt.

## Evidence tables by run

**Verified testnet transactions**

Historical exhibit transactions (read-only tape on topic `0.0.10569989`) are documented in
the appendix ([`docs/history/window-9/appendix.md`](./history/window-9/appendix.md)); the genesis-NFT
live run notes are at [`genesis-nft/LIVE_RUN.md`](../genesis-nft/LIVE_RUN.md).

**2026-09-21 E2E, superseded instance** (its registry `0xC923…`, topic `0.0.10649257` and
PROVC token `0.0.10649238` are no longer the live instance; kept as historical evidence;
operator `0.0.9034044`; topic ≠ exhibit; evidence:
[`docs/e2e/E2E-TESTNET-2026-09-21.md`](./e2e/E2E-TESTNET-2026-09-21.md)):

| Step | Transaction | HashScan link |
|---|---|---|
| Registry deployment | `ProvenanceRegistry` at `0xC9231fa293113991285ed41b60906Dfb0E2CDC01` | [contract](https://hashscan.io/testnet/contract/0xC9231fa293113991285ed41b60906Dfb0E2CDC01) |
| Template topic (live) | `0.0.10649257` (auto-created; **not** `0.0.10569989`) | [topic](https://hashscan.io/testnet/topic/0.0.10649257) |
| Receipt anchor (HCS) | `0.0.9034044@1789999996.558665178` (topic `0.0.10649257`, seq 3) | [transaction](https://hashscan.io/testnet/transaction/0.0.9034044@1789999996.558665178) |
| Registry `anchorReceipt` | `0xb3513ef3b0394b4a80d65b46d07ea78fa988a21668df4549267a3d8202e66ecd` | [transaction](https://hashscan.io/testnet/transaction/0xb3513ef3b0394b4a80d65b46d07ea78fa988a21668df4549267a3d8202e66ecd) |
| Certificate collection | token `0.0.10649238` (PROVC) | [token](https://hashscan.io/testnet/token/0.0.10649238) |
| Certificate NFT mint (HTS) | `0.0.9034044@1790000007.430466835` (serial #1) | [transaction](https://hashscan.io/testnet/transaction/0.0.9034044@1790000007.430466835) |
| Mirror re-verify | decisionHash match on seq 3 | [mirror message](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10649257/messages/3) |
| Forged `/api/anchor` | tampered decisionHash → HTTP **403** | refused (no write) |

**2026-09-23 runs** (two operator rigs, run against the pre-hardening registry
`0x5Ad5…`, since superseded by the redeploy below; full evidence:
[`docs/e2e/E2E-TESTNET-2026-09-23.md`](./e2e/E2E-TESTNET-2026-09-23.md)):

| Run | Anchors | Result |
|---|---|---|
| Second operator (`0.0.10685865`) | HCS seq 3–6, topic `0.0.10681528` | 4/4 `verifyReceipt` true; duplicate anchor refused (409); mint not-run (`INVALID_SIGNATURE`: operator lacks supply key; not faked) |
| Template operator (`0.0.9034044`) | HCS seq 7–10, topic `0.0.10681528` | 4/4 `verifyReceipt` true; NFT serials **4** and **5** minted for the two verified claims; red claims minted nothing |
| XRPL devnet | 8/8 attestations (both rigs) | strict `tesSUCCESS`, memo byte-match |
| Solana devnet | 4/4 attestations (operator packet + explorer) | memo byte-match |
| Universal checker | 100/100 checks | HCS seq 7-10 and XRPL 4/4 independently re-read from a third machine; Solana via operator packet + explorer |

Live identifiers: registry
[`0xd564579399aAc654CcB5C5F768679471aa795f55`](https://hashscan.io/testnet/contract/0xd564579399aAc654CcB5C5F768679471aa795f55),
topic [`0.0.10681528`](https://hashscan.io/testnet/topic/0.0.10681528), PROVC
token [`0.0.10653074`](https://hashscan.io/testnet/token/0.0.10653074).

Note: the live testnet instance above is the operator-hardened redeploy,
deployed 2026-09-24 from main @ `9c1d70b`. Deploy transaction:
[`0xdc4b903ea7385bede39dc433023ebb0dfb44d50dfcf10c2404b3250b5e9eec5d`](https://hashscan.io/testnet/transaction/0xdc4b903ea7385bede39dc433023ebb0dfb44d50dfcf10c2404b3250b5e9eec5d).
The prior address `0x5Ad54d39d860Cb2c2c6A27c787eead7358137e1a` is retained only as
the superseded pre-hardening instance (historical artifact). Procedure and
verification record:
[`docs/e2e/REGISTRY-REDEPLOY.md`](./e2e/REGISTRY-REDEPLOY.md).
