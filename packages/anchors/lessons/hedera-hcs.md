# Hedera HCS anchor — lessons

Ported reference implementation. Wraps the template's `HederaAnchor`
(`packages/swarm/src/hedera.ts`).

- **Payload.** The HCS message is the compact receipt-hash JSON
  (`claimId`, `version`, `taskHash`, `decisionHash`, `verdict`, `timestamp`).
  The full claim never goes on-chain; the hashes are the commitment.
- **Topic.** `ensureTopic()` reuses `HEDERA_TEMPLATE_TOPIC_ID` when set, else
  auto-creates a topic memoed "Provenance Swarm receipt anchors". It refuses
  the frozen Window 9 exhibit topic (`0.0.10569989`) — template live paths
  must never write there.
- **Finality signal.** `anchorReceipt` returns the topic id, topic sequence
  number, and transaction id. The transaction id is the `anchorId` surfaced in
  `AnchorResult`; the sequence number is the ordering proof.
- **Mirror lag.** Mirror nodes trail consensus by seconds. The frontend's
  "Verify on mirror node" step retries; a missing message is "not visible
  yet", not "not anchored".
- **Key curve.** Operator keys are parsed honoring `HEDERA_KEY_TYPE`
  (`ecdsa` vs `ed25519`); the SDK default is ED25519 and raw 32-byte keys
  cannot be distinguished by inspection. Wrong curve = obscure signature
  failure, so the adapter surface takes the already-configured backend.
