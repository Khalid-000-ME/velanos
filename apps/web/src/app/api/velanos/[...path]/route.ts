import { type NextRequest } from 'next/server';
import { apiBase, apiHeaders } from '@/lib/api';

/**
 * Same-origin proxy to the indexer API.
 *
 * The browser only ever talks to this app's own origin, which matters when the API is reached through
 * a tunnel: there is no CORS to configure, no mixed content, and — the reason this exists at all —
 * ngrok's browser interstitial is skipped. That page is bypassed with a request header, and an
 * `EventSource` cannot set headers, so the live intent stream could not get past it on its own.
 *
 * Streaming is preserved by handing the upstream body straight back, so `/events` still arrives as
 * server-sent events rather than being buffered into one response.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const search = req.nextUrl.search;
  const target = `${apiBase()}/${path.join('/')}${search}`;

  const upstream = await fetch(target, {
    method: req.method,
    headers: {
      ...apiHeaders(),
      accept: req.headers.get('accept') ?? 'application/json',
      ...(req.headers.get('content-type') ? { 'content-type': req.headers.get('content-type')! } : {}),
    },
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text(),
    cache: 'no-store',
  });

  const headers = new Headers();
  for (const key of ['content-type', 'cache-control']) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  // Proxies and the platform both buffer by default, which would stall the event stream.
  if (headers.get('content-type')?.includes('text/event-stream')) {
    headers.set('cache-control', 'no-cache, no-transform');
    headers.set('connection', 'keep-alive');
    headers.set('x-accel-buffering', 'no');
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}
