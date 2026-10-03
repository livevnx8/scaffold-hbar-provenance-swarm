/**
 * Provenance Swarm Template — Mirror Node re-verification
 *
 * After a receipt is anchored on an HCS topic, anyone — including a party that
 * never trusted the verifier — can re-fetch the topic message from a Hedera
 * Mirror Node and confirm the anchored decisionHash matches the receipt they
 * were handed. No API keys required; mirror nodes are public read APIs.
 *
 * Trust boundary: a decisionHash match alone proves nothing, because template
 * topics are created with a null submit key and anyone can append a copy of a
 * hash. The check therefore also requires the message's topic_id and
 * payer_account_id to equal the operator topic and operator account taken from
 * server config (MirrorTrust), never from the receipt or the request.
 */

export type HederaNetworkName = 'testnet' | 'mainnet';

const MIRROR_BASE: Record<HederaNetworkName, string> = {
  testnet: 'https://testnet.mirrornode.hedera.com',
  mainnet: 'https://mainnet.mirrornode.hedera.com',
};

export interface HcsAnchorLookup {
  network: HederaNetworkName;
  /**
   * Topic the caller believes holds the anchor. Optional and untrusted: when
   * present it must equal `trust.topicId`, otherwise the check is refused. The
   * fetch always targets `trust.topicId`, never this value.
   */
  topicId?: string;
  /** Topic message sequence number returned at anchor time. */
  sequenceNumber: string | number;
  /** The decisionHash the receipt claims was anchored. */
  expectedDecisionHash: string;
}

/**
 * Who is allowed to have written the anchor. Comes from server config (or the
 * registry), never from the receipt or the HTTP request. Auto-created template
 * topics have a null submit key, so anyone can append a message carrying a
 * copied decisionHash; only the operator's payer account and the operator's
 * topic make a mirror match meaningful.
 */
export interface MirrorTrust {
  /** Hedera account id (shard.realm.num) that must have paid for the message. */
  operatorAccountId: string;
  /** The operator's receipt topic (shard.realm.num). */
  topicId: string;
}

export type MirrorRefusal =
  | 'trust-not-configured'
  | 'bad-lookup'
  | 'topic-mismatch'
  | 'payer-mismatch';

export interface MirrorVerification {
  /** Whether the mirror node returned a message for this sequence number. */
  found: boolean;
  /** Whether the anchored decisionHash matches AND the message came from the operator on the operator topic. */
  match: boolean;
  /** The decoded topic message, when found and parseable. */
  message?: Record<string, unknown>;
  /** payer_account_id reported by the mirror node, when found. */
  payerAccountId?: string;
  /** topic_id reported by the mirror node, when found. */
  topicId?: string;
  /** Set when the check was refused on trust grounds (not a hash mismatch). */
  refused?: MirrorRefusal;
  error?: string;
}

const ENTITY_ID = /^\d+\.\d+\.\d+$/;
const SEQUENCE = /^[1-9]\d*$/;

/**
 * Build the trust anchor from server env: the operator account and the
 * operator's live topic. Returns null when either is missing or malformed, so
 * callers fail closed instead of trusting request input.
 */
export function mirrorTrustFromEnv(env: NodeJS.ProcessEnv = process.env): MirrorTrust | null {
  const operatorAccountId = env.HEDERA_OPERATOR_ID?.trim();
  const topicId =
    env.HEDERA_TEMPLATE_TOPIC_ID?.trim() || env.HEDERA_PROVENANCE_TOPIC_ID?.trim();
  if (!operatorAccountId || !topicId) return null;
  if (!ENTITY_ID.test(operatorAccountId) || !ENTITY_ID.test(topicId)) return null;
  return { operatorAccountId, topicId };
}

/** Public REST URL for a topic message — safe to link in the UI. */
export function mirrorMessageUrl(
  network: HederaNetworkName,
  topicId: string,
  sequenceNumber: string | number,
): string {
  return `${MIRROR_BASE[network]}/api/v1/topics/${topicId}/messages/${sequenceNumber}`;
}

/** Best-effort decode for refusal reports; never throws. */
function tryDecode(message: unknown): Record<string, unknown> | undefined {
  if (typeof message !== 'string' || !message) return undefined;
  try {
    const v = JSON.parse(Buffer.from(message, 'base64').toString('utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeHash(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2).toLowerCase() : hex.toLowerCase();
}

/**
 * Fetch an HCS topic message from the mirror node and check, in order: the
 * message is on the operator topic, it was paid for by the operator account,
 * and its decisionHash equals the expected one. `match` is true only when all
 * three hold. Returns { found: false } when the message isn't visible yet
 * (mirror nodes typically lag consensus by a few seconds) instead of throwing.
 */
export async function verifyHcsAnchorOnMirror(
  lookup: HcsAnchorLookup,
  trust: MirrorTrust | null,
  fetchImpl: typeof fetch = fetch,
): Promise<MirrorVerification> {
  if (!trust || !ENTITY_ID.test(trust.operatorAccountId) || !ENTITY_ID.test(trust.topicId)) {
    return {
      found: false,
      match: false,
      refused: 'trust-not-configured',
      error:
        'Mirror trust is not configured: set HEDERA_OPERATOR_ID and HEDERA_TEMPLATE_TOPIC_ID on the server',
    };
  }
  const { network, sequenceNumber, expectedDecisionHash } = lookup;
  if (!SEQUENCE.test(String(sequenceNumber))) {
    return { found: false, match: false, refused: 'bad-lookup', error: 'sequenceNumber must be a positive integer' };
  }
  if (lookup.topicId !== undefined && lookup.topicId !== trust.topicId) {
    return {
      found: false,
      match: false,
      refused: 'topic-mismatch',
      error: `Topic ${String(lookup.topicId)} is not the operator topic ${trust.topicId}`,
    };
  }
  let res: Response;
  try {
    res = await fetchImpl(mirrorMessageUrl(network, trust.topicId, String(sequenceNumber)));
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

  let body: { message?: string; payer_account_id?: string; topic_id?: string };
  try {
    body = (await res.json()) as { message?: string; payer_account_id?: string; topic_id?: string };
  } catch {
    return { found: false, match: false, error: 'Mirror node returned invalid JSON' };
  }
  const payerAccountId = typeof body.payer_account_id === 'string' ? body.payer_account_id : undefined;
  const topicId = typeof body.topic_id === 'string' ? body.topic_id : undefined;
  if (topicId !== trust.topicId) {
    return {
      found: true,
      match: false,
      payerAccountId,
      topicId,
      message: tryDecode(body.message),
      refused: 'topic-mismatch',
      error: `Mirror message topic ${topicId ?? 'missing'} is not the operator topic ${trust.topicId}`,
    };
  }
  if (payerAccountId !== trust.operatorAccountId) {
    return {
      found: true,
      match: false,
      payerAccountId,
      topicId,
      message: tryDecode(body.message),
      refused: 'payer-mismatch',
      error: `Message was paid for by ${payerAccountId ?? 'unknown'}, not the operator ${trust.operatorAccountId}`,
    };
  }
  if (!body.message) {
    return { found: false, match: false, payerAccountId, topicId, error: 'Mirror node message had no payload' };
  }

  let decoded: Record<string, unknown>;
  try {
    decoded = JSON.parse(Buffer.from(body.message, 'base64').toString('utf8'));
  } catch {
    return { found: true, match: false, payerAccountId, topicId, error: 'Anchored payload is not JSON' };
  }

  const anchored = decoded['decisionHash'];
  if (typeof anchored !== 'string') {
    return {
      found: true,
      match: false,
      payerAccountId,
      topicId,
      message: decoded,
      error: 'Anchored payload has no decisionHash',
    };
  }
  return {
    found: true,
    match: normalizeHash(anchored) === normalizeHash(expectedDecisionHash),
    payerAccountId,
    topicId,
    message: decoded,
  };
}
