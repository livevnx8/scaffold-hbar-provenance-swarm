# Appendix: the frozen Window 9 exhibit

Window 9 is a **historical, read-only** research tape on Hedera testnet topic
[`0.0.10569989`](https://hashscan.io/testnet/topic/0.0.10569989). It is **not**
the template's live anchor topic. Template live anchors use
`HEDERA_TEMPLATE_TOPIC_ID` (auto-created when empty). Writing to `0.0.10569989`
from template paths is refused.

| Seq | Result | HashScan |
|---|---|---|
| 833 | GREEN (valid) | [tx](https://hashscan.io/testnet/transaction/0.0.9032608@1789868602.323750400) |
| 834 | GREEN (valid) | [tx](https://hashscan.io/testnet/transaction/0.0.9032608@1789869656.328037066) |
| 835 | RED (refused, withheld) | [tx](https://hashscan.io/testnet/transaction/0.0.9032608@1789870540.047570332) |

Pinned identifiers: [`identifiers.md`](./identifiers.md).
Narrative PDF: [`decision-integrity-record.pdf`](./decision-integrity-record.pdf).

Locked red-line from that record (verbatim):

> This is not "the model failed." The harness failed the artifact on purpose. The worker was honest; the gate did its job. The red does not count toward n — n stays 2. Do not blur.

## Why this tape is kept

Window 9 is a fail-closed gate between an AI's MAKE decision and the world,
where a correctly refused run is a first-class, hashed, public record. It is
kept as an exhibit because the refusal is the load-bearing part of the
design: the same fail-closed instinct runs through this template (tampered
claims return `needs_review`, forged receipts are refused at the server gate
before any write).

It is documentation, not a dependency. No verify or anchor path in this
template reads Window 9 sequences.
