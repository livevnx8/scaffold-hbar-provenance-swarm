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
  MIRROR_CASSETTE_SECOND_OPERATOR_MESSAGE,
  MIRROR_CASSETTE_SECOND_OPERATOR_DECISION_HASH,
  MIRROR_CASSETTE_SYNTHETIC_STRANGER_MESSAGE,
  TEAM_OPERATOR_ALLOWLIST,
  TEAM_RECEIPT_TOPIC_ID,
} from '../src/index.js';

const OPERATOR = '0.0.1001';
const TRUST = { allowedPayers: [OPERATOR, '0.0.1002'], topicId: '0.0.12345' };

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
  return { message, payer_account_id: OPERATOR, topic_id: TRUST.topicId };
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
        payer_account_id: OPERATOR,
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

  it('accepts every payer on the allowlist, and only those', async () => {
    for (const payer of TRUST.allowedPayers) {
      const res = await verifyHcsAnchorOnMirror(
        LOOKUP,
        TRUST,
        stubFetch({ message: anchoredMessage(LOOKUP.expectedDecisionHash), payer_account_id: payer, topic_id: TRUST.topicId }),
      );
      expect(res.match).toBe(true);
    }
    const res = await verifyHcsAnchorOnMirror(
      LOOKUP,
      TRUST,
      stubFetch({ message: anchoredMessage(LOOKUP.expectedDecisionHash), payer_account_id: '0.0.10010', topic_id: TRUST.topicId }),
    );
    expect(res.refused).toBe('payer-mismatch');
  });

  it('refuses an empty or malformed allowlist and never fetches', async () => {
    for (const bad of [{ ...TRUST, allowedPayers: [] }, { ...TRUST, allowedPayers: ['0.0.1', 'x'] }]) {
      const requested: string[] = [];
      const res = await verifyHcsAnchorOnMirror(LOOKUP, bad, mirrorCassetteFetch([], requested));
      expect(res.refused).toBe('trust-not-configured');
      expect(requested).toHaveLength(0);
    }
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

  it('GREEN: seq 3, paid for by the second team operator 0.0.10685865, matches', async () => {
    const res = await verifyHcsAnchorOnMirror(
      {
        network: 'testnet',
        topicId: MIRROR_CASSETTE_TRUST.topicId,
        sequenceNumber: MIRROR_CASSETTE_SECOND_OPERATOR_MESSAGE.sequence_number,
        expectedDecisionHash: MIRROR_CASSETTE_SECOND_OPERATOR_DECISION_HASH,
      },
      MIRROR_CASSETTE_TRUST,
      fetchImpl,
    );
    expect(res.match).toBe(true);
    expect(res.payerAccountId).toBe('0.0.10685865');
  });

  it('RED: the synthetic stranger copy has a matching decisionHash but is refused', async () => {
    expect(MIRROR_CASSETTE_SYNTHETIC_STRANGER_MESSAGE.running_hash).toMatch(/SYNTHETIC/);
    const res = await verifyHcsAnchorOnMirror(
      {
        network: 'testnet',
        topicId: MIRROR_CASSETTE_TRUST.topicId,
        sequenceNumber: MIRROR_CASSETTE_SYNTHETIC_STRANGER_MESSAGE.sequence_number,
        expectedDecisionHash: MIRROR_CASSETTE_OPERATOR_DECISION_HASH,
      },
      MIRROR_CASSETTE_TRUST,
      fetchImpl,
    );
    expect(res.found).toBe(true);
    expect(res.message?.decisionHash).toBe(MIRROR_CASSETTE_OPERATOR_DECISION_HASH);
    expect(res.match).toBe(false);
    expect(res.refused).toBe('payer-mismatch');
    expect(res.payerAccountId).toBe('0.0.999999999');
  });
});

describe('mirrorTrustFromEnv', () => {
  it('defaults to the published team allowlist and topic', () => {
    expect(mirrorTrustFromEnv({})).toEqual({
      allowedPayers: ['0.0.9034044', '0.0.10685865'],
      topicId: '0.0.10681528',
    });
    expect(TEAM_OPERATOR_ALLOWLIST).toEqual(['0.0.9034044', '0.0.10685865']);
    expect(TEAM_RECEIPT_TOPIC_ID).toBe('0.0.10681528');
  });
  it('does not add HEDERA_OPERATOR_ID to the allowlist implicitly', () => {
    expect(mirrorTrustFromEnv({ HEDERA_OPERATOR_ID: '0.0.5' })?.allowedPayers).toEqual([
      '0.0.9034044',
      '0.0.10685865',
    ]);
  });
  it('reads a comma-separated allowlist and topic overrides from env', () => {
    expect(
      mirrorTrustFromEnv({ HEDERA_MIRROR_ALLOWED_PAYERS: ' 0.0.5, 0.0.8 ', HEDERA_MIRROR_TOPIC_ID: '0.0.6' }),
    ).toEqual({ allowedPayers: ['0.0.5', '0.0.8'], topicId: '0.0.6' });
  });
  it('falls back to the template topic, then the legacy alias', () => {
    expect(mirrorTrustFromEnv({ HEDERA_TEMPLATE_TOPIC_ID: '0.0.6' })?.topicId).toBe('0.0.6');
    expect(mirrorTrustFromEnv({ HEDERA_PROVENANCE_TOPIC_ID: '0.0.7' })?.topicId).toBe('0.0.7');
    expect(
      mirrorTrustFromEnv({ HEDERA_MIRROR_TOPIC_ID: '0.0.9', HEDERA_TEMPLATE_TOPIC_ID: '0.0.6' })?.topicId,
    ).toBe('0.0.9');
  });
  it('returns null (fail closed) when a configured value is malformed', () => {
    expect(mirrorTrustFromEnv({ HEDERA_MIRROR_ALLOWED_PAYERS: '0.0.5,x' })).toBeNull();
    expect(mirrorTrustFromEnv({ HEDERA_MIRROR_ALLOWED_PAYERS: ' , ' })).toBeNull();
    expect(mirrorTrustFromEnv({ HEDERA_MIRROR_TOPIC_ID: 'topic' })).toBeNull();
  });
});
