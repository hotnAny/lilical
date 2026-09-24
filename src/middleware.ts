import { defineMiddleware } from 'astro:middleware';
import { COOKIE, matches, passphrase, token } from './lib/auth';

// The manifest and icons are fetched without the cookie, so they must stay open.
const OPEN = ['/login', '/api/login', '/favicon.svg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

export const onRequest = defineMiddleware(async (ctx, next) => {
  const p = passphrase();
  if (!p || OPEN.includes(ctx.url.pathname)) return next();
  const got = ctx.cookies.get(COOKIE)?.value ?? '';
  if (matches(got, token(p))) return next();
  if (ctx.url.pathname.startsWith('/api/')) return new Response('Unauthorized', { status: 401 });
  return ctx.redirect('/login');
});
