import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Optional bearer-token guard for POST /api/anchor.
 *
 * WARNING: /api/anchor signs with the server's operator key and spends its
 * HBAR on every call (HCS message, registry transaction, NFT mint). Anyone
 * can build a self-consistent claim that verifies, so on any deployment
 * reachable by others set ANCHOR_API_TOKEN and send
 * `Authorization: Bearer <token>`. Unset, the route stays open, which is
 * convenient for local testnet development only.
 */
export function anchorAuth(
  authorization: string | null | undefined,
  token: string | undefined = process.env.ANCHOR_API_TOKEN,
): { ok: true; open: boolean } | { ok: false; status: 401; error: string } {
  const expected = token?.trim();
  if (!expected) return { ok: true, open: true };
  const m = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? '');
  const presented = m?.[1]?.trim() ?? '';
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  if (!presented || !timingSafeEqual(a, b)) {
    return {
      ok: false,
      status: 401,
      error: 'Anchoring requires Authorization: Bearer <ANCHOR_API_TOKEN> on this server.',
    };
  }
  return { ok: true, open: false };
}
