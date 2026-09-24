/**
 * S5: /api/contract-verify claim-reverified mode must recompute through the
 * shared createClient() factory (the 4-worker oracle client), never
 * `new ProvenanceClient()` directly. Before the fix, an honest verified
 * Phase 2 value receipt failed the posted-vs-recomputed decisionHash check
 * with "Posted decisionHash does not match", because the 3-worker client
 * drops the value worker.
 *
 * The route module is imported directly and POST is invoked with synthetic
 * Requests (no Next.js server needed). HEDERA_REGISTRY_ADDRESS is left unset
 * so the claim-reverified recomputation path is reached and asserted before
 * the registry lookup stage.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, fixtureValueClaimWithEvidence } from '@provenance-swarm/oracle';
import { POST } from '../app/api/contract-verify/route.js';

delete process.env.HEDERA_REGISTRY_ADDRESS;

function req(body: unknown): Request {
  return new Request('http://localhost/api/contract-verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('contract-verify claim-reverified uses the 4-worker client (S5)', () => {
  test('honest 4-worker value receipt passes recomputation (reaches registry stage)', async () => {
    const claim = fixtureValueClaimWithEvidence();
    const { receipt } = createClient().verifyClaim(claim);
    assert.equal(receipt.verdict, 'verified');

    const res = await POST(
      req({ claimId: claim.claimId, decisionHash: receipt.decisionHash, claim }),
    );
    const data = (await res.json()) as { mode?: string; error?: string };
    // Recomputation matched: the route must proceed past the decisionHash
    // check into claim-reverified mode and fail only on the missing registry.
    assert.equal(res.status, 400);
    assert.equal(data.mode, 'claim-reverified');
    assert.match(data.error ?? '', /No registry contract configured/);
  });

  test('forged decisionHash on the same claim is still refused', async () => {
    const claim = fixtureValueClaimWithEvidence();
    const forged = '0'.repeat(64);

    const res = await POST(
      req({ claimId: claim.claimId, decisionHash: forged, claim }),
    );
    const data = (await res.json()) as { match?: boolean; error?: string };
    assert.equal(data.match, false);
    assert.match(data.error ?? '', /does not match/);
  });

  test('plain 3-worker claim still verifies in claim-reverified mode', async () => {
    const { fixtureClaim } = await import('@provenance-swarm/swarm');
    const claim = fixtureClaim();
    const { receipt } = createClient().verifyClaim(claim);

    const res = await POST(
      req({ claimId: claim.claimId, decisionHash: receipt.decisionHash, claim }),
    );
    const data = (await res.json()) as { mode?: string; error?: string };
    assert.equal(res.status, 400);
    assert.equal(data.mode, 'claim-reverified');
    assert.match(data.error ?? '', /No registry contract configured/);
  });
});
