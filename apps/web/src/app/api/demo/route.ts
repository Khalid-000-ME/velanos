import { NextResponse } from 'next/server';
import { apiBase, apiHeaders } from '@/lib/api';

/**
 * Server-side proxy for the demo controls.
 *
 * The admin token lives in the server environment and is attached here, so it never reaches the
 * browser bundle or a network tab. The operator console calls this route; this route calls the
 * indexer. Nothing the token unlocks can move depositor funds — the protocol has no admin keys — but
 * a token that leaks still lets a stranger poison a news feed mid-demo.
 */
const TOKEN = process.env.DEMO_ADMIN_TOKEN ?? 'change-me-local-only';

const ALLOWED_PATHS = new Set([
  '/demo/shock',
  '/demo/news/poison',
  '/demo/agent/run',
  '/demo/reset',
  '/demo/state',
]);

export async function POST(request: Request) {
  const { path, body } = (await request.json()) as { path?: string; body?: unknown };

  // An allowlist rather than a prefix check: without it this route forwards an attacker-chosen path
  // to the indexer with our credentials attached.
  const isScenario = typeof path === 'string' && /^\/demo\/scenario\/s[0-6]$/.test(path);
  if (!path || (!ALLOWED_PATHS.has(path) && !isScenario)) {
    return NextResponse.json({ error: 'path not allowed' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json',
        ...apiHeaders(), 'x-demo-token': TOKEN },
      body: JSON.stringify(body ?? {}),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { error: 'indexer unreachable', detail: (e as Error).message },
      { status: 502 },
    );
  }
}
