import type { APIRoute } from 'astro';
import { applyOps, getData } from '../../lib/store';
import type { Op } from '../../lib/model';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async () => json(await getData());

// Body: { ops: Op[] }. Returns the saved data so the client can resync.
export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json()) as { ops?: Op[] };
  if (!Array.isArray(body.ops) || body.ops.length === 0) return json({ error: 'ops required' }, 400);
  try {
    return json(await applyOps(body.ops));
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
};
