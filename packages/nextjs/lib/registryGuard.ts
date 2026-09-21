/**
 * Anchor-route guards shared by the API routes and unit-tested here.
 * Pure functions: no Next.js, no ethers, no network.
 */

/**
 * One-anchor-per-claim is enforced by the ProvenanceRegistry contract, and
 * only by it. Anchoring or minting without a registry would let the same
 * claim anchor twice and mint twice (adversarial finding F6, 2026-09-21),
 * so the anchor route fails closed when HEDERA_REGISTRY_ADDRESS is unset.
 * Deploy one with:
 *   npm run deploy:testnet --workspace=@provenance-swarm/contracts
 */
export function registryGuard(): { ok: true; address: string } | { ok: false; error: string } {
  const address = process.env.HEDERA_REGISTRY_ADDRESS?.trim();
  if (!address) {
    return {
      ok: false,
      error:
        'HEDERA_REGISTRY_ADDRESS is not configured. The anchor route requires the ' +
        'ProvenanceRegistry contract so one-anchor-per-claim is enforced on-chain; ' +
        'without it the same claim could be anchored and minted repeatedly. ' +
        'Deploy the registry and set HEDERA_REGISTRY_ADDRESS to continue.',
    };
  }
  return { ok: true, address };
}
