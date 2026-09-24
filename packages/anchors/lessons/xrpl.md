# XRPL anchor — lessons (pending port)

Status: fail-closed stub. Devin confirmed the anchor script works on his
machine; the verified port and its re-verification are outstanding.

## Known concern: memo chunking

XRPL memos carry bounded byte payloads. The ported script chunks the anchor
payload to fit — the exact chunk size and framing must be transcribed from
Devin's verified script when the port lands, not invented here.

## To transcribe on port

- Exact memo field(s) used and their byte limits.
- Chunk framing (how a verifier reassembles and re-hashes the payload).
- Testnet faucet and env names for the keyed run.
- The explorer transaction hash format surfaced as `anchorId`.
