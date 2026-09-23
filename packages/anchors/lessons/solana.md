# Solana anchor — lessons (pending port)

Status: fail-closed stub. Devin confirmed the anchor script works on his
machine; the verified port and its re-verification are outstanding.

## Known concern: blockhash expiry

Solana transactions reference a recent blockhash with a short validity
window. The ported script must handle expiry between construction and
submission — the exact retry/rebuild policy must be transcribed from Devin's
verified script when the port lands, not invented here.

## To transcribe on port

- Where the receipt hash is written (memo program / account data) and why.
- Blockhash refresh and resubmission policy.
- Devnet faucet and env names for the keyed run.
- The transaction signature format surfaced as `anchorId`.
