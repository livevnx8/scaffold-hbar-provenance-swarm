import { NextResponse } from 'next/server';
import { fixtureValueClaim } from '@provenance-swarm/swarm';

/**
 * The fixture claim carries declaredValue (the fourth claim dimension) but
 * NO oracleEvidence — the verify route attaches live evidence via
 * attestClaimValue(). Offline demos use fixtureOracleEvidence() instead.
 */
export async function GET() {
  return NextResponse.json(fixtureValueClaim());
}