import type { FastifyInstance, FastifyReply } from 'fastify';
import { bus, type AegisEvent } from '../lib/events';

/**
 * Server-sent events for the live UI.
 *
 * SSE rather than websockets: the traffic is one-directional, it survives proxies that mangle
 * upgrades, and the browser reconnects on its own. A reconnecting client backfills over REST, so a
 * dropped event costs nothing.
 */
export async function streamRoutes(app: FastifyInstance): Promise<void> {
  app.get('/events', async (req, reply) => {
    openStream(reply);
    const unsubscribe = bus.subscribe((event) => send(reply, event));

    const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 15_000);
    req.raw.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  /** Only the public evidence locker, for the watcher and the /watch screen. */
  app.get('/feed/intents', async (req, reply) => {
    openStream(reply);
    const unsubscribe = bus.subscribe((event) => {
      if (event.type === 'FeedIntentPublished') send(reply, event);
    });

    const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 15_000);
    req.raw.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });
}

function openStream(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    // Nginx and friends buffer by default, which turns a live feed into a batch job.
    'x-accel-buffering': 'no',
  });
  reply.raw.write(': connected\n\n');
}

function send(reply: FastifyReply, event: AegisEvent): void {
  if (reply.raw.writableEnded) return;
  reply.raw.write(`event: ${event.type}\n`);
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}
