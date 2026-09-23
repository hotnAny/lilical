// All data lives in one JSON file in a separate data repo (GITHUB_REPO), read
// and written through the GitHub Contents API with GITHUB_TOKEN. Commits there
// never trigger a deploy, because Vercel only watches this code repo.
// In `astro dev` with no credentials set, the file is kept at .data/ instead
// (same fallback as teaching's src/lib/github.ts).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { apply, emptyData, type Data, type Op } from './model';

const GITHUB_API = 'https://api.github.com';
const PATH = 'lilical.json';
const LOCAL = resolve(process.cwd(), '.data', PATH);

function creds(): { token: string; repo: string } | null {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (token && repo) return { token, repo };
  if (import.meta.env.DEV) return null;
  throw new Error('GITHUB_TOKEN and GITHUB_REPO must be set');
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

class Conflict extends Error {}

async function load(): Promise<{ data: Data; sha?: string }> {
  const c = creds();
  if (!c) {
    try {
      return { data: JSON.parse(await readFile(LOCAL, 'utf8')) };
    } catch {
      return { data: emptyData() };
    }
  }
  const res = await fetch(`${GITHUB_API}/repos/${c.repo}/contents/${PATH}`, {
    headers: headers(c.token),
    cache: 'no-store',
  });
  if (res.status === 404) return { data: emptyData() };
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  // The JSON response inlines content only up to 1 MB, which is years of lists.
  const out = (await res.json()) as { content: string; sha: string };
  return { data: JSON.parse(Buffer.from(out.content, 'base64').toString('utf8')), sha: out.sha };
}

async function save(data: Data, sha: string | undefined, message: string): Promise<void> {
  const json = JSON.stringify(data, null, 2) + '\n';
  const c = creds();
  if (!c) {
    await mkdir(dirname(LOCAL), { recursive: true });
    await writeFile(LOCAL, json);
    return;
  }
  const res = await fetch(`${GITHUB_API}/repos/${c.repo}/contents/${PATH}`, {
    method: 'PUT',
    headers: headers(c.token),
    body: JSON.stringify({ message, content: Buffer.from(json, 'utf8').toString('base64'), sha }),
  });
  // 409: sha is stale; 422: file created meanwhile (we sent no sha).
  if (res.status === 409 || res.status === 422) throw new Conflict();
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
}

export async function getData(): Promise<Data> {
  return (await load()).data;
}

// Replays ops on the latest copy; if another device saved in between, reload
// and replay again.
export async function applyOps(ops: Op[]): Promise<Data> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, sha } = await load();
    for (const o of ops) apply(data, o);
    try {
      await save(data, sha, ops.map((o) => o.op).join(', '));
      return data;
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
    }
  }
  throw new Error('Could not save: the data file kept changing');
}
