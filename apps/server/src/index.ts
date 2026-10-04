import cors from '@fastify/cors';
import Fastify from 'fastify';
import { migrate } from './db/index';
import { env } from './env';
import { indexer } from './indexer';
import { demoRoutes } from './routes/demo';
import { healthRoutes } from './routes/health';
import { inspectRoutes } from './routes/inspect';
import { newsRoutes } from './routes/news';
import { relayRoutes } from './routes/relay';
import { streamRoutes } from './routes/stream';
import { vaultRoutes } from './routes/vaults';

/**
 * The read side of Velanos: an indexer, a REST/SSE API over it, an intent relay, and the demo
 * controls.
 *
 * Nothing here is trusted by the protocol. The server holds no authority over a vault — it can pay
 * gas for an intent the agent already signed, and that is the extent of it. Everything it serves is
 * derived from chain state and rebuildable by deleting the database file.
 */
const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
  },
});

async function main(): Promise<void> {
  migrate();

  await app.register(cors, { origin: true });

  // bigint JSON support: amounts are uint256 and must survive serialisation intact.
  app.setSerializerCompiler(() => (data) => JSON.stringify(data, bigintReplacer));

  await app.register(healthRoutes);
  await app.register(vaultRoutes);
  await app.register(inspectRoutes);
  await app.register(relayRoutes);
  await app.register(streamRoutes);
  await app.register(newsRoutes);
  await app.register(demoRoutes);

  await indexer.start();

  await app.listen({ port: env.SERVER_PORT, host: '0.0.0.0' });
  app.log.info(`velanos server listening on :${env.SERVER_PORT}`);
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info(`${signal} received, shutting down`);
    indexer.stop();
    void app.close().then(() => process.exit(0));
  });
}

main().catch((e) => {
  app.log.error(e);
  process.exit(1);
});
