import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Access policy for POST /api/anchor. Fails closed.
 *
 * WARNING: /api/anchor signs with the server's operator key and spends its
 * HBAR on every call (HCS message, registry transaction, NFT mint), and anyone
 * can build a self-consistent claim that verifies. So the route is OFF unless
 * the server opts in:
 *
 *   - ANCHOR_API_TOKEN unset/blank or shorter than 16 chars -> disabled (503)
 *   - ANCHOR_API_ENABLED=false (or 0/no/off)                 -> disabled (503),
 *     even with a token. Use this on public deployments that should only
 *     verify and re-check, never write.
 *   - otherwise the caller must send `Authorization: Bearer <token>`;
 *     missing or wrong token -> 401. The compare is constant-time over
 *     sha256 digests, so neither content nor length leaks through timing.
 */
export const ANCHOR_TOKEN_MIN_LENGTH = 16;

export interface AnchorAuthEnv {
  ANCHOR_API_TOKEN?: string;
  ANCHOR_API_ENABLED?: string;
  [key: string]: string | undefined;
}

export type AnchorPolicy =
  | { enabled: true; token: string }
  | { enabled: false; reason: 'token-unset' | 'token-too-short' | 'disabled-by-flag' };

function flagIsOff(raw: string | undefined): boolean {
  return ['false', '0', 'no', 'off'].includes((raw ?? '').trim().toLowerCase());
}

/** Resolve whether anchoring is enabled. Never returns the token to callers outside the server. */
export function anchorPolicy(env: AnchorAuthEnv = process.env): AnchorPolicy {
  if (flagIsOff(env.ANCHOR_API_ENABLED)) return { enabled: false, reason: 'disabled-by-flag' };
  const token = env.ANCHOR_API_TOKEN?.trim() ?? '';
  if (!token) return { enabled: false, reason: 'token-unset' };
  if (token.length < ANCHOR_TOKEN_MIN_LENGTH) return { enabled: false, reason: 'token-too-short' };
  return { enabled: true, token };
}

const DISABLED_MESSAGE: Record<Exclude<AnchorPolicy, { enabled: true }>['reason'], string> = {
  'token-unset':
    'Anchoring is disabled on this server: ANCHOR_API_TOKEN is not set. ' +
    'Set it (16+ characters) in packages/nextjs/.env to enable POST /api/anchor.',
  'token-too-short':
    `Anchoring is disabled on this server: ANCHOR_API_TOKEN must be at least ${ANCHOR_TOKEN_MIN_LENGTH} characters.`,
  'disabled-by-flag': 'Anchoring is disabled on this server (ANCHOR_API_ENABLED=false).',
};

function digest(s: string): Buffer {
  return createHash('sha256').update(s, 'utf8').digest();
}

export function anchorAuth(
  authorization: string | null | undefined,
  env: AnchorAuthEnv = process.env,
):
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string; disabled?: true } {
  const policy = anchorPolicy(env);
  if (!policy.enabled) {
    return { ok: false, status: 503, disabled: true, error: DISABLED_MESSAGE[policy.reason] };
  }
  const m = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? '');
  const presented = m?.[1]?.trim() ?? '';
  // Always run the compare (even for an empty token) so timing does not
  // reveal whether a token was presented.
  const match = timingSafeEqual(digest(presented), digest(policy.token));
  if (!presented || !match) {
    return {
      ok: false,
      status: 401,
      error: 'Anchoring requires Authorization: Bearer <ANCHOR_API_TOKEN> on this server.',
    };
  }
  return { ok: true };
}
