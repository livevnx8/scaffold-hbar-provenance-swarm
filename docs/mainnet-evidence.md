# Mainnet evidence

Full system end-to-end on Hedera mainnet: verify a claim offline, anchor the receipt on a mainnet HCS topic, and re-verify the bytes from the mainnet mirror node. Back to the [README](../README.md).

## E2E — 2026-10-03

| Step | Link |
|---|---|
| Topic created | [hashscan.io/mainnet/topic/0.0.10903540](https://hashscan.io/mainnet/topic/0.0.10903540) |
| Receipt anchored (seq 1) | [hashscan.io/mainnet/transaction/0.0.10417333@1791039282.988874194](https://hashscan.io/mainnet/transaction/0.0.10417333@1791039282.988874194) |
| Mirror re-read | [mainnet.mirrornode.hedera.com/api/v1/topics/0.0.10903540/messages?sequencenumber=1](https://mainnet.mirrornode.hedera.com/api/v1/topics/0.0.10903540/messages?sequencenumber=1) |

### Run facts

- **Network:** Hedera mainnet
- **Operator:** `0.0.10417333` (ECDSA, key validated against the account before any write)
- **Claim:** `claim-cof-042` (deterministic fixture)
- **Verdict:** verified
- **Task hash:** `61b0b4d41e9112a1cb2b6bb61c111e3e26a86882a620210eb38c8922a788de27`
- **Decision hash:** `ced16219ef78c0010828befc5fa5c3f82fec75107af9950b417116fdb4d00f5c`

### Mirror verification

The message bytes re-read from the mainnet mirror node decode to the same `taskHash` and
`decisionHash` produced by the offline verifier. Byte-identical.

**What the match proves:** the mainnet message commits to the exact claim and verdict the
repo's checks produce.

**What it does not prove:** who posted it — anyone running the public repo reproduces the same
hashes. The "who" rests on the paying account, `0.0.10417333`.

### Cost

Topic creation + one anchor message: ~0.102 HBAR total.

| | HBAR |
|---|---|
| Balance before | 0.99886161 |
| Balance after | 0.89652179 |

### Scope

Full system pipeline on mainnet: offline verification, HCS anchoring, and independent mirror
re-verification. The anchor target on this run was HCS; registry contract deployment and the
certificate NFT on mainnet were deferred (the operator account held ~1 HBAR, below a mainnet
contract deploy). The complete verify, anchor, re-verify loop is demonstrated live.

### Operator note

The mainnet operator (`0.0.10417333`) is separate from the testnet operators on the repo's
mirror-check allowlist (`0.0.9034044`, `0.0.10685865`), so the repo's automated mirror check
does not cover this anchor. The evidence above is independently re-checkable: fetch the mirror
link, base64-decode the message, and compare the hashes against a fresh local run of the
verifier.

## Check it yourself

```bash
curl -s "https://mainnet.mirrornode.hedera.com/api/v1/topics/0.0.10903540/messages?sequencenumber=1"
```

Base64-decode the `message` field and compare its `taskHash` and `decisionHash` against a
fresh local run of the verifier on `claim-cof-042`.
