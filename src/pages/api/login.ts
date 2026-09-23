import type { APIRoute } from 'astro';
import { COOKIE, matches, passphrase, token } from '../../lib/auth';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const p = passphrase();
  const form = await request.formData();
  const given = String(form.get('passphrase') ?? '');
  if (p && !matches(token(given), token(p))) return redirect('/login?wrong=1');
  if (p)
    cookies.set(COOKIE, token(p), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: import.meta.env.PROD,
      maxAge: 60 * 60 * 24 * 365,
    });
  return redirect('/');
};
