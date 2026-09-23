// Passphrase gate. The cookie holds a hash of the passphrase, so changing
// LILICAL_PASSPHRASE on Vercel logs every device out.

import { createHash, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'lilical_auth';

export function passphrase(): string | null {
  const p = process.env.LILICAL_PASSPHRASE;
  if (p) return p;
  if (import.meta.env.DEV) return null; // no gate in local dev without one
  throw new Error('LILICAL_PASSPHRASE must be set');
}

export function token(p: string): string {
  return createHash('sha256').update(`lilical:${p}`).digest('hex');
}

export function matches(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
