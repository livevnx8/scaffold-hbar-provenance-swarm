/**
 * Provenance Swarm Template — Mirror Node verification tests
 *
 * The mirror helper is tested with a stubbed fetch: no network, no credentials.
 */

import {
  verifyHcsAnchorOnMirror,
  mirrorMessageUrl,
  mirrorTrustFromEnv,
  mirrorCassetteFetch,
  MIRROR_CASSETTE_TRUST,
  MIRROR_CASSETTE_OPERATOR_MESSAGE,
  MIRROR_CASSETTE_OPERATOR_DECISION_HASH,
  MIRROR_CASSETTE_FOREIGN_PAYER_MESSAGE,
  MIRROR_CASSETTE_FOREIGN_PAYER_DECISION_HASH,
} from '../src/index.js';

const TRUST = { operatorAccountId: '0.0.1001', topicId: '0.0.12345' };

const LOOKUP = {
  network: 'testnet' as const,
  topicId: '0.0.12345',
  sequenceNumber: '7',
  expectedDecisionHash: 'ab'.repeat(32),
};

function stubFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    ({
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
    }) as Response) as typeof fetch;
}

/** A mirror message body as the operator would have written it to its own topic. */
function operatorBody(message: string): Record<string, string> {
  return { message, payer_account_id: TRUST.operatorAccountId, topic_id: TRUST.topicId };
}

function anchoredMessage(decisionHash: string): string {
  return Buffer.from(
    JSON.stringify({ type: 'provenance-receipt-anchor', decisionHash }),
    'utf8',
  ).toString('base64');
}

describe('mirrorMessageUrl', () => {
  it('builds the public mirror REST URL for a topic message', () => {
    expect(mirrorMessageUrl('testnet', '0.0.12345', 7)).toBe(
      'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.12345/messages/7',
    );
  });
});

describe('verifyHcsAnchorOnMirror', () => {
  it('matches when the anchored decisionHash equals the expected hash', async () => {
    const res = await verifyHcsAnchorOnMirror(
      LOOKUP,
      TRUST,
      stubFetch(operatorBody(anchoredMessage(LOOKUP.expectedDecisionHash))),
    );
    expect(res.found).toBe(true);
    expect(res.match).toBe(true);
  });

  it('detects a mismatched decisionHash', async () => {
    const res = await verifyHcsAnchorOnMirror(
      LOOKUP,
      TRUST,
      stubFetch(operatorBody(anchoredMessage('cd'.repeat(32)))),
    );
    expect(res.found).toBe(true);
    expect(res.match).toBe(false);
  });

  it('reports not-found when the mirror node has no such message yet', async () => {
    const res = await verifyHcsAnchorOnMirror(LOOKUP, TRUST, stubFetch({ _status: 'not found' }, 404));
    expect(res.found).toBe(false);
    expect(res.match).toBe(false);
  });

  it('does not throw when the mirror node is unreachable', async () => {
    const failing = (async () => {
      throw new Error('boom');
    }) as typeof fetch;
    const res = await verifyHcsAnchorOnMirror(LOOKUP, TRUST, failing);
    expect(res.found).toBe(false);
    expect(res.match).toBe(false);
    expect(res.error).toMatch('boom');
  });
});

describe('verifyHcsAnchorOnMirror trust boundary (payer + topic)', () => {
  it('refuses a matching hash paid for by a non-operator account', async () => {
    const res = await verifyHcsAnchorOnMirror(
      LOOKUP,
      TRUST,
      stubFetch({
        message: anchoredMessage(LOOKUP.expectedDecisionHash),
        payer_account_id: '0.0.6666',
        topic_id: TRUST.topicId,
      }),
    );
    expect(res.found).toBe(true);
    expect(res.match).toBe(false);
    expect(res.refused).toBe('payer-mismatch');
    expect(res.payerAccountId).toBe('0.0.6666');
  });

  it('refuses when the mirror reports a different topic than the operator topic', async () => {
    const res = await verifyHcsAnchorOnMirror(
      { ...LOOKUP, topicId: undefined },
      TRUST,
      stubFetch({
        message: anchoredMessage(LOOKUP.expectedDecisionHash),
        payer_account_id: TRUST.operatorAccountId,
        topic_id: '0.0.99999',
      }),
    );
    expect(res.match).toBe(false);
    expect(res.refused).toBe('topic-mismatch');
  });

  it('refuses a missing payer_account_id (fail closed)', async () => {
    const res = await verifyHcsAnchorOnMirror(
      LOOKUP,
      TRUST,
      stubFetch({ message: anchoredMessage(LOOKUP.expectedDecisionHash), topic_id: TRUST.topicId }),
    );
    expect(res.match).toBe(false);
    expect(res.refused).toBe('payer-mismatch');
  });

  it('refuses a request topic that differs from the operator topic without fetching', async () => {
    const requested: string[] = [];
    const res = await verifyHcsAnchorOnMirror(
      { ...LOOKUP, topicId: '0.0.777' },
      TRUST,
      mirrorCassetteFetch([], requested),
    );
    expect(res.refused).toBe('topic-mismatch');
    expect(requested).toHaveLength(0);
  });

  it('refuses without trust config and never fetches', async () => {
    const requested: string[] = [];
    const res = await verifyHcsAnchorOnMirror(LOOKUP, null, mirrorCassetteFetch([], requested));
    expect(res.refused).toBe('trust-not-configured');
    expect(requested).toHaveLength(0);
  });

  it('rejects path-like sequence numbers', async () => {
    const res = await verifyHcsAnchorOnMirror(
      { ...LOOKUP, sequenceNumber: '7/../../accounts' },
      TRUST,
      mirrorCassetteFetch([]),
    );
    expect(res.refused).toBe('bad-lookup');
  });

  it('always fetches the operator topic, not the request topic', async () => {
    const requested: string[] = [];
    await verifyHcsAnchorOnMirror(
      { network: 'testnet', sequenceNumber: 7, expectedDecisionHash: MIRROR_CASSETTE_OPERATOR_DECISION_HASH },
      MIRROR_CASSETTE_TRUST,
      mirrorCassetteFetch(undefined, requested),
    );
    expect(requested).toEqual([
      'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10681528/messages/7',
    ]);
  });
});

describe('mirror cassette (recorded testnet responses)', () => {
  const fetchImpl = mirrorCassetteFetch();

  it('GREEN: operator-paid seq 7 matches', async () => {
    const res = await verifyHcsAnchorOnMirror(
      {
        network: 'testnet',
        topicId: MIRROR_CASSETTE_TRUST.topicId,
        sequenceNumber: MIRROR_CASSETTE_OPERATOR_MESSAGE.sequence_number,
        expectedDecisionHash: MIRROR_CASSETTE_OPERATOR_DECISION_HASH,
      },
      MIRROR_CASSETTE_TRUST,
      fetchImpl,
    );
    expect(res.match).toBe(true);
    expect(res.refused).toBeUndefined();
  });

  it('RED: seq 3 has a matching decisionHash but a foreign payer, so it is refused', async () => {
    const res = await verifyHcsAnchorOnMirror(
      {
        network: 'testnet',
        topicId: MIRROR_CASSETTE_TRUST.topicId,
        sequenceNumber: MIRROR_CASSETTE_FOREIGN_PAYER_MESSAGE.sequence_number,
        expectedDecisionHash: MIRROR_CASSETTE_FOREIGN_PAYER_DECISION_HASH,
      },
      MIRROR_CASSETTE_TRUST,
      fetchImpl,
    );
    expect(res.found).toBe(true);
    expect(res.message?.decisionHash).toBe(MIRROR_CASSETTE_FOREIGN_PAYER_DECISION_HASH);
    expect(res.match).toBe(false);
    expect(res.refused).toBe('payer-mismatch');
    expect(res.payerAccountId).toBe('0.0.10685865');
  });
});

describe('mirrorTrustFromEnv', () => {
  it('reads operator id and template topic from env', () => {
    expect(
      mirrorTrustFromEnv({ HEDERA_OPERATOR_ID: '0.0.5', HEDERA_TEMPLATE_TOPIC_ID: '0.0.6' }),
    ).toEqual({ operatorAccountId: '0.0.5', topicId: '0.0.6' });
  });
  it('falls back to the legacy topic alias', () => {
    expect(
      mirrorTrustFromEnv({ HEDERA_OPERATOR_ID: '0.0.5', HEDERA_PROVENANCE_TOPIC_ID: '0.0.7' }),
    ).toEqual({ operatorAccountId: '0.0.5', topicId: '0.0.7' });
  });
  it('returns null when either value is missing or malformed', () => {
    expect(mirrorTrustFromEnv({ HEDERA_OPERATOR_ID: '0.0.5' })).toBeNull();
    expect(mirrorTrustFromEnv({ HEDERA_TEMPLATE_TOPIC_ID: '0.0.6' })).toBeNull();
    expect(
      mirrorTrustFromEnv({ HEDERA_OPERATOR_ID: 'x', HEDERA_TEMPLATE_TOPIC_ID: '0.0.6' }),
    ).toBeNull();
  });
});
