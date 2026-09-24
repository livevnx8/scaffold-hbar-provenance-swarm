import { NextResponse } from 'next/server';
import { attestClaimValue, AttestationError } from '@provenance-swarm/oracle';
import { createClient } from '@/lib/client';
import type { ProvenanceClaim } from '@provenance-swarm/swarm';

export async function POST(req: Request) {
  let claim: ProvenanceClaim;
  try {
    claim = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!claim || typeof claim.claimId !== 'string' || !claim.claimId) {
    return NextResponse.json({ error: 'Claim must include a claimId' }, { status: 400 });
  }
  if (!claim.origin || !Array.isArray(claim.custody) || !Array.isArray(claim.documents)) {
    return NextResponse.json(
      { error: 'Claim must include origin, custody, and documents' },
      { status: 400 },
    );
  }

  try {
    // Phase 2: a claim carrying declaredValue is attested against the live
    // Chainlink feed BEFORE the swarm runs — the observed round is committed
    // into claim.oracleEvidence so taskHash binds it and the anchor gate's
    // re-run sees identical input. Fail closed: malformed declaredValue →
    // 400, feed unreachable/stale → 502. No receipt is produced either way;
    // attestation is never silently skipped for a claim that declares value.
    let enriched = claim;
    if (claim.declaredValue) {
      try {
        enriched = await attestClaimValue(claim);
      } catch (err) {
        if (err instanceof AttestationError && err.kind === 'client') {
          return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return NextResponse.json(
          {
            error:
              err instanceof Error ? err.message : 'Oracle feeds unreachable',
          },
          { status: 502 },
        );
      }
    }
    const { receipt, report } = createClient().verifyClaim(enriched);
    // The enriched claim (with oracleEvidence) is echoed back so the UI can
    // display the committed feed data and post it to /api/anchor unchanged.
    return NextResponse.json({ receipt, report, claim: enriched });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Verification failed' },
      { status: 500 },
    );
  }
}