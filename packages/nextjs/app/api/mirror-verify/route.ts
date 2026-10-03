import { NextResponse } from 'next/server';
import { verifyHcsAnchorOnMirror, mirrorTrustFromEnv } from '@provenance-swarm/swarm';

/**
 * Re-read an HCS anchor from the public mirror node.
 *
 * The operator account and operator topic come from server config only
 * (HEDERA_OPERATOR_ID, HEDERA_TEMPLATE_TOPIC_ID). A request-supplied topicId is
 * accepted only if it equals the operator topic; a message paid for by any
 * other account is refused even when its decisionHash matches, because the
 * template topic has a null submit key and anyone can append to it.
 */
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
  if (
    sequenceNumber === undefined ||
    typeof expectedDecisionHash !== 'string' ||
    !expectedDecisionHash ||
    (topicId !== undefined && typeof topicId !== 'string')
  ) {
    return NextResponse.json(
      { error: 'sequenceNumber and expectedDecisionHash are required (topicId optional, string)' },
      { status: 400 },
    );
  }

  const trust = mirrorTrustFromEnv();
  if (!trust) {
    return NextResponse.json(
      {
        found: false,
        match: false,
        refused: 'trust-not-configured',
        error:
          'Mirror check needs HEDERA_OPERATOR_ID and HEDERA_TEMPLATE_TOPIC_ID set on the server; ' +
          'request-supplied topics are never trusted.',
      },
      { status: 503 },
    );
  }

  const network = body.network === 'mainnet' ? 'mainnet' : 'testnet';
  const result = await verifyHcsAnchorOnMirror(
    { network, topicId, sequenceNumber, expectedDecisionHash },
    trust,
  );
  return NextResponse.json(result, { status: result.refused === 'bad-lookup' ? 400 : 200 });
}
