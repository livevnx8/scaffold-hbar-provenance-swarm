export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1.5rem" }}>
      <h1>Provenance Swarm</h1>
      <p>
        A Scaffold-HBAR template for verifiable supply-chain provenance. Submit a product's origin
        attestation, custody chain, and supporting documents — three deterministic verifier agents
        check each dimension, and the tamper-evident receipt is anchored on Hedera.
      </p>
      <h2>How it works</h2>
      <ol>
        <li>Origin Attestation Verifier recomputes the attestation hash.</li>
        <li>Custody Chain Verifier walks the hash-linked handoffs in time order.</li>
        <li>Document Hash Verifier checks every attached SHA-256 digest.</li>
        <li>The receipt (taskHash + decisionHash) is anchored via HCS and the registry contract.</li>
        <li>Accepted claims mint a provenance-certificate NFT (HTS).</li>
      </ol>
      <p>
        <em>
          Full claim-submission UI lands during the build window — this shell scaffolds cleanly and
          the offline swarm already runs via <code>yarn demo</code> at the repo root.
        </em>
      </p>
    </main>
  );
}