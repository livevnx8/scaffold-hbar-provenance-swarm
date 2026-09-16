# Provenance Swarm — a Scaffold-HBAR template

Verifiable supply-chain provenance for Hedera. Three deterministic verifier agents check a product's
**origin attestation**, **custody chain**, and **document hashes**; the coordinator binds the verdicts into a
tamper-evident receipt; the receipt is anchored on Hedera and a provenance-certificate NFT is minted for
accepted claims. A Next.js frontend lets anyone submit a claim, watch verification run, and inspect the
on-chain receipt.

Scaffold it in one command:

```bash
npm create scaffold-hbar@latest -- --template livevnx8/scaffold-hbar-provenance-swarm
```

## What's inside

```
packages/
  swarm/       Deterministic agent core: workers, coordinator, receipt builder,
               double-verifier, plus Hedera anchoring (HCS) and certificate minting (HTS)
  contracts/   Hardhat: ProvenanceRegistry.sol — on-chain anchor + lookup for receipts
  nextjs/      Claim submission UI, verification run view, receipt inspector
```

## Quick start (no Hedera account needed)

```bash
yarn install
yarn demo          # credential-free demo on a fixture coffee shipment
yarn test          # all workspace test suites
```

## Hedera services in play

| Service | Role |
|---|---|
| Smart Contract Service | `ProvenanceRegistry` stores `decisionHash` per claim — anyone can verify a receipt on-chain |
| HCS | Receipt hash anchored as a topic message |
| HTS | Provenance-certificate NFT minted per accepted claim |
| Mirror Node | Frontend re-verifies the HCS anchor via mirror REST; links out to HashScan |

## Going to testnet

1. Create a testnet account via the [Hedera Portal](https://portal.hedera.com) and fund it from the faucet.
2. Copy `packages/nextjs/.env.example` to `packages/nextjs/.env` and add your operator credentials.
3. Deploy the registry: `yarn workspace @provenance-swarm/contracts deploy:testnet`
4. Run the full claim flow in the frontend and record the transaction hashes below.

**Verified testnet transactions** (to be recorded during the build window):

| Step | Transaction | HashScan link |
|---|---|---|
| Registry deployment | _pending_ | _pending_ |
| Receipt anchor (HCS) | _pending_ | _pending_ |
| Certificate NFT mint (HTS) | _pending_ | _pending_ |

## Architecture

```
ProvenanceClaim
  → AgentRegistry (3 verifier workers)
  → ProvenanceSwarmCoordinator.run(claim)
  → ProvenanceReceipt { taskHash, decisionHash, verdict, results }
  → HieroDoubleVerifier.verify(receipt, claim)   (pass A: hash integrity, pass B: policy)
  → HederaAnchor.anchor(receipt)                 (HCS topic message + registry contract)
  → CertificateMinter.mint(claim, receipt)       (HTS NFT for accepted claims)
```

## License

MIT — see [LICENSE](./LICENSE).
