# Vera Genesis Receipt — live testnet run (2026-09-16)

Operator: **0.0.9032608** (ECDSA/secp256k1 key, `HEDERA_KEY_TYPE=ecdsa`)
Network: Hedera **testnet** only. The mint script refuses mainnet.

## What happened

1. Genesis claim verified offline: `verified` / double-verifier `accepted`, 3/3 workers.
2. Receipt anchored on HCS, topic **0.0.10569989** ("Provenance Swarm receipt anchors").
   - Sequence **2**: tx `0.0.9032608@1789565505.352869642`
   - [HashScan](https://hashscan.io/testnet/transaction/0.0.9032608@1789565505.352869642)
   - [Mirror Node message](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10569989/messages/2)
   - Message payload re-fetched and confirmed: `decisionHash`
     `eb3d574fe1de2628f0a5b89c40cd7434754ef2db05373aa69751ac9ae87e071d`
     matches the receipt exactly.
3. Collection created: **0.0.10569997** — "Vera Genesis Receipt" (**VGEN**),
   treasury 0.0.9032608.
   - [HashScan token](https://hashscan.io/testnet/token/0.0.10569997)
4. Serial **#1** minted: tx `0.0.9032608@1789565511.702573940`
   - [HashScan](https://hashscan.io/testnet/transaction/0.0.9032608@1789565511.702573940)
   - [Mirror Node NFT](https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.10569997/nfts/1)
   - On-chain metadata (81 bytes): `vera-genesis-001/eb3d574fe1de2628f0a5b89c40cd7434754ef2db05373aa69751ac9ae87e071d`

## Honest notes

- **First attempt failed** with `METADATA_TOO_LONG`: the full HIP-412 JSON does not
  fit Hedera's 100-byte NFT metadata limit. The token carries a compact
  `claimId/decisionHash` pointer instead; the full JSON stays in this repo
  (`metadata.json`) for IPFS pinning later. The script now enforces the limit.
- That failed attempt left an **empty collection 0.0.10569992** on testnet.
  The canonical collection is **0.0.10569997**.
- The script also anchored sequence **1** on the topic during the failed run
  (tx `0.0.9032608@1789565474.460330049`); sequence **2** is the canonical anchor
  matching serial #1.
- Sequence 1's anchor is equally valid — both messages carry the same receipt hashes.
- No mainnet anything. No wallet ceremony — server-side operator-key (relayer) flow.
