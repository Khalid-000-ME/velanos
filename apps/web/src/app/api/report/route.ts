import { NextResponse } from 'next/server';

/**
 * Marks a feed entry as claimed after the reader's own wallet reported it.
 *
 * Bookkeeping only. The slash already happened on-chain when their transaction landed; this stops the
 * entry showing as unclaimed while the indexer catches up, so two people do not both try to report
 * the same nonce and one wastes gas on a revert.
 */
const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4000';

export async function POST(request: Request) {
  const body = await request.json();
  try {
    const res = await fetch(`${SERVER_URL}/feed/intents/reported`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'indexer unreachable' }, { status: 502 });
  }
}
