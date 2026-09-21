# Window 9 identifiers — frozen fixture only

This file pins the public identifiers of the Window 9 research record so a
stranger can replay them from the public mirror. Read-only fixture. Nothing
here is edited, re-anchored, or claimed as this template's output.

- Network: Hedera testnet
- HCS topic: `0.0.10569989`
- Operator: `0.0.9032608`
- Seq 833 — GREEN — valid — `eligible=true`
  - recordHash: `b9241f05dafa76c801d90cf5210f816b61dd698f0dabfbe34c1be894964ddd42`
  - decisionHash: `626cb38b0dd5b6c7b48418f163f190c39c517f0d0f3719f2a7afb99694ad0610`
  - tx: `0.0.9032608@1789868602.323750400`
- Seq 834 — GREEN — valid — `eligible=true`
  - recordHash: `ac16ce7e44de03534e42eb40c4ad1ddd1982816313762cfda23acc517af1d66e`
  - decisionHash: `e680e75c5464130627309047d92a8155a0d9bb8a7dce2d3a61656a6fd9f6af0b`
  - tx: `0.0.9032608@1789869656.328037066`
- Seq 835 — RED — invalid — `eligible=false` — `withheld=true`
  - Deliberate harness tamper after an honest worker return
    (`"FizzBuzz"` → `"FizzBuz"`), before verification. Not a model failure.
  - recordHash: `280767d4a0d6760df40589a140178356ee415a01a12b3e2ce43e7607c90a6136`
  - decisionHash: `af0049b48cf1d1c05de743ced338c3da64dd051a72d92c58f3eb48ec029fca7d`
  - tx: `0.0.9032608@1789870540.047570332`

Reliability count from this tape: **n = 2** (833, 834). Seq 835 does not count.

## Why this tape is in the template

Window 9 is a **historical exhibit**: a fail-closed gate between an AI's MAKE
decision and the world, where a correctly refused run is a first-class, hashed,
public record. The narrative record is `decision-integrity-record.pdf` in this
directory.

This template does **not** pull Window 9 sequences from the public mirror in
any verify or anchor path. The identifiers above are documentation so a
stranger can open HashScan or the mirror REST API themselves. Template live
anchors must use a **separate** topic via `HEDERA_TEMPLATE_TOPIC_ID` (or leave
it empty to auto-create one). Writing to `0.0.10569989` from template paths is
refused.

HashScan quick links:

- [Topic 0.0.10569989](https://hashscan.io/testnet/topic/0.0.10569989)
- [Seq 833 tx](https://hashscan.io/testnet/transaction/0.0.9032608@1789868602.323750400)
- [Seq 834 tx](https://hashscan.io/testnet/transaction/0.0.9032608@1789869656.328037066)
- [Seq 835 tx](https://hashscan.io/testnet/transaction/0.0.9032608@1789870540.047570332)
