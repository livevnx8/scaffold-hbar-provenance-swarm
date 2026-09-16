import { NextResponse } from 'next/server';
import { fixtureClaim } from '@provenance-swarm/swarm';

export async function GET() {
  return NextResponse.json(fixtureClaim());
}