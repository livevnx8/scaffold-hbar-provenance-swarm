import { NextResponse } from 'next/server';
import { verifyHcsAnchorOnMirror } from '@provenance-swarm/swarm';

export async function POST(req: Request) {
  let body: {
    network?: string;
    topicId?: string;
    sequenceNumber?: string | number;
    expectedDecisionHash?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { topicId, sequenceNumber, expectedDecisionHash } = body;
  if (!topicId || sequenceNumber === undefined || !expectedDecisionHash) {
    return NextResponse.json(
      { error: 'topicId, sequenceNumber, and expectedDecisionHash are required' },
      { status: 400 },
    );
  }

  const network = body.network === 'mainnet' ? 'mainnet' : 'testnet';
  const result = await verifyHcsAnchorOnMirror({
    network,
    topicId,
    sequenceNumber,
    expectedDecisionHash,
  });
  return NextResponse.json(result);
}