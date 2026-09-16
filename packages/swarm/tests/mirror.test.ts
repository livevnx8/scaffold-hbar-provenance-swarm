/**
 * Provenance Swarm Template — Mirror Node verification tests
 *
 * The mirror helper is tested with a stubbed fetch: no network, no credentials.
 */

import { verifyHcsAnchorOnMirror, mirrorMessageUrl } from '../src/index.js';

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
      stubFetch({ message: anchoredMessage(LOOKUP.expectedDecisionHash) }),
    );
    expect(res.found).toBe(true);
    expect(res.match).toBe(true);
  });

  it('detects a mismatched decisionHash', async () => {
    const res = await verifyHcsAnchorOnMirror(
      LOOKUP,
      stubFetch({ message: anchoredMessage('cd'.repeat(32)) }),
    );
    expect(res.found).toBe(true);
    expect(res.match).toBe(false);
  });

  it('reports not-found when the mirror node has no such message yet', async () => {
    const res = await verifyHcsAnchorOnMirror(LOOKUP, stubFetch({ _status: 'not found' }, 404));
    expect(res.found).toBe(false);
    expect(res.match).toBe(false);
  });

  it('does not throw when the mirror node is unreachable', async () => {
    const failing = (async () => {
      throw new Error('boom');
    }) as typeof fetch;
    const res = await verifyHcsAnchorOnMirror(LOOKUP, failing);
    expect(res.found).toBe(false);
    expect(res.match).toBe(false);
    expect(res.error).toMatch('boom');
  });
});
