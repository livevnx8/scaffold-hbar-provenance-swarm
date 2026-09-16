/**
 * Provenance Swarm Template — Mirror Node re-verification
 *
 * After a receipt is anchored on an HCS topic, anyone — including a party that
 * never trusted the verifier — can re-fetch the topic message from a Hedera
 * Mirror Node and confirm the anchored decisionHash matches the receipt they
 * were handed. No API keys required; mirror nodes are public read APIs.
 */

export type HederaNetworkName = 'testnet' | 'mainnet';

const MIRROR_BASE: Record<HederaNetworkName, string> = {
  testnet: 'https://testnet.mirrornode.hedera.com',
  mainnet: 'https://mainnet.mirrornode.hedera.com',
};

export interface HcsAnchorLookup {
  network: HederaNetworkName;
  topicId: string;
  /** Topic message sequence number returned at anchor time. */
  sequenceNumber: string | number;
  /** The decisionHash the receipt claims was anchored. */
  expectedDecisionHash: string;
}

export interface MirrorVerification {
  /** Whether the mirror node returned a message for this sequence number. */
  found: boolean;
  /** Whether the anchored decisionHash matches the expected one. */
  match: boolean;
  /** The decoded topic message, when found and parseable. */
  message?: Record<string, unknown>;
  error?: string;
}

/** Public REST URL for a topic message — safe to link in the UI. */
export function mirrorMessageUrl(
  network: HederaNetworkName,
  topicId: string,
  sequenceNumber: string | number,
): string {
  return `${MIRROR_BASE[network]}/api/v1/topics/${topicId}/messages/${sequenceNumber}`;
}

function normalizeHash(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2).toLowerCase() : hex.toLowerCase();
}

/**
 * Fetch an HCS topic message from the mirror node and check its decisionHash.
 * Returns { found: false } when the message isn't visible yet (mirror nodes
 * typically lag consensus by a few seconds) instead of throwing.
 */
export async function verifyHcsAnchorOnMirror(
  lookup: HcsAnchorLookup,
  fetchImpl: typeof fetch = fetch,
): Promise<MirrorVerification> {
  const { network, topicId, sequenceNumber, expectedDecisionHash } = lookup;
  let res: Response;
  try {
    res = await fetchImpl(mirrorMessageUrl(network, topicId, sequenceNumber));
  } catch (err) {
    return {
      found: false,
      match: false,
      error: err instanceof Error ? err.message : 'Mirror node unreachable',
    };
  }
  if (res.status === 404) {
    return { found: false, match: false };
  }
  if (!res.ok) {
    return { found: false, match: false, error: `Mirror node responded ${res.status}` };
  }

  let body: { message?: string };
  try {
    body = (await res.json()) as { message?: string };
  } catch {
    return { found: false, match: false, error: 'Mirror node returned invalid JSON' };
  }
  if (!body.message) {
    return { found: false, match: false, error: 'Mirror node message had no payload' };
  }

  let decoded: Record<string, unknown>;
  try {
    decoded = JSON.parse(Buffer.from(body.message, 'base64').toString('utf8'));
  } catch {
    return { found: true, match: false, error: 'Anchored payload is not JSON' };
  }

  const anchored = decoded['decisionHash'];
  if (typeof anchored !== 'string') {
    return { found: true, match: false, message: decoded, error: 'Anchored payload has no decisionHash' };
  }
  return {
    found: true,
    match: normalizeHash(anchored) === normalizeHash(expectedDecisionHash),
    message: decoded,
  };
}
