# Base anchor — lessons (pending port)

Status: fail-closed stub. Devin confirmed the anchor script works on his
machine; the verified port and its re-verification are outstanding.

## Known concern: pre-submit assertion

Before submitting, the ported script asserts the exact transaction it is
about to send (recipient, calldata, value) — the assertion policy must be
transcribed from Devin's verified script when the port lands, not invented
here. No blind sends on a keyed path.

## To transcribe on port

- The assertion checklist (what is verified pre-submit, and what aborts).
- Whether the anchor is a plain transaction or a contract call, and the
  contract address on Sepolia.
- Sepolia faucet and env names for the keyed run.
- The transaction hash format surfaced as `anchorId`.
