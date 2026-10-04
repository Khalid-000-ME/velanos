import Fastify from 'fastify';
import { env } from './env';
import { AgentRunner, PROFILES } from './runner';

/**
 * The agent service: an HTTP control surface over one signing key.
 *
 * Kept as its own process because the trust boundary matters. This is the only component that holds
 * the agent's signing key, and the protocol gives it no privileges at all — it can sign intents, and
 * the vault decides what happens to them.
 */
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
const runner = new AgentRunner();

app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/status' || req.url === '/health') return;
  if (req.headers['x-demo-token'] !== env.DEMO_ADMIN_TOKEN) {
    return reply.code(401).send({ error: 'missing or invalid x-demo-token' });
  }
});

app.get('/health', async () => ({ ok: true }));

app.get('/status', async () => ({
  signer: runner.signerAddress,
  llmMode: env.LLM_MODE,
  model: env.LLM_MODEL,
  profile: runner.lastProfile,
  lastResult: runner.lastResult ?? null,
  profiles: Object.values(PROFILES).map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    route: p.route,
    preflight: p.preflight,
    expected: p.expected,
  })),
}));

app.post<{ Body: { vault?: string; profile?: string; steps?: number } }>('/run', async (req, reply) => {
  const { vault, profile, steps } = req.body ?? {};
  if (!vault || !profile) return reply.code(400).send({ error: 'vault and profile are required' });

  try {
    const results = await runner.run(vault as `0x${string}`, profile, steps ?? 1);
    return { ok: true, results };
  } catch (e) {
    app.log.error(e);
    return reply.code(500).send({ error: (e as Error).message });
  }
});

/** Heartbeat so the UI status bar can show whether the agent is alive. */
setInterval(() => {
  void fetch(`${env.SERVER_URL}/heartbeat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ service: 'agent', detail: `${env.LLM_MODE}/${env.LLM_MODEL}` }),
  }).catch(() => undefined);
}, 10_000);

app
  .listen({ port: env.AGENT_PORT, host: '0.0.0.0' })
  .then(() => app.log.info(`velanos agent listening on :${env.AGENT_PORT} as ${runner.signerAddress}`))
  .catch((e) => {
    app.log.error(e);
    process.exit(1);
  });
