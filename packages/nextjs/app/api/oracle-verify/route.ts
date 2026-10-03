import { NextResponse } from 'next/server';
import { recheckOracleEvidenceOnChain } from '@provenance-swarm/oracle';
import type { ProvenanceClaim } from '@provenance-swarm/swarm';

/**
 * Third-party oracle audit: re-read every Chainlink round committed in
 * claim.oracleEvidence with getRoundData(roundId) on the pinned testnet proxy
 * (read-only eth_call via Hashio, no keys) and report field-level matches.
 *
 * 200 { ok, failure?, checks } when the feed answered (ok:false means the
 * committed evidence does not match the chain); 502 when it could not be read.
 */
export async function POST(req: Request) {
  let body: { claim?: ProvenanceClaim };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const claim = body?.claim;
  if (!claim || typeof claim !== 'object' || typeof claim.claimId !== 'string') {
    return NextResponse.json({ error: 'Body must be { claim } with a claimId' }, { status: 400 });
  }
  const result = await recheckOracleEvidenceOnChain(claim);
  return NextResponse.json(result, { status: result.failure === 'feed-unreachable' ? 502 : 200 });
}
