import { NextResponse } from 'next/server';
import { ProvenanceClient } from '@provenance-swarm/swarm';
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
    const { receipt, report } = new ProvenanceClient().verifyClaim(claim);
    return NextResponse.json({ receipt, report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Verification failed' },
      { status: 500 },
    );
  }
}