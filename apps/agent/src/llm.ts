import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { env } from './env';
import { ProposalSchema, type Proposal, type ProposalRecord } from './proposal';

const PROMPTS_DIR = join(import.meta.dirname, 'prompts');
const FIXTURES_DIR = join(import.meta.dirname, '..', 'fixtures');

export interface ProposeArgs {
  mandateEnglish: string[];
  state: string;
  signals: string;
  profile: string;
  /** Fixture key for replay mode, usually the scenario or profile name. */
  fixture?: string;
}

/**
 * Asks the model for one trade proposal.
 *
 * Two modes, and the distinction matters for the demo:
 *
 * - `live` calls the API. Used for judge Q&A, where the point is that a real model is driving.
 * - `replay` reads a recorded fixture. Used for recording, where a demo that depends on model
 *   availability and non-determinism is a demo that fails on camera.
 *
 * Either way the model's output is advice. It is validated, mapped to raw units by code, and
 * checked against the mandate before a signature exists — the enforcement is never delegated to
 * the model, which is the whole point of the product.
 */
export async function propose(args: ProposeArgs): Promise<ProposalRecord> {
  const prompt = buildPrompt(args);

  if (env.LLM_MODE === 'replay') {
    return replay(args, prompt);
  }

  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('LLM_MODE=live needs ANTHROPIC_API_KEY; set it or switch to LLM_MODE=replay');
  }

  const client = new Anthropic();

  // Structured outputs rather than a forced tool call: forced tool_choice is rejected on current
  // models, and `parse` validates the response against the same zod schema used everywhere else.
  const response = await client.messages.parse({
    model: env.LLM_MODEL,
    max_tokens: 4_000,
    // Routine trading judgement; medium effort is the right rung and keeps the loop responsive.
    output_config: { effort: 'medium', format: zodOutputFormat(ProposalSchema) },
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(
      `model declined to respond (${response.stop_details?.category ?? 'unknown'}): ${response.stop_details?.explanation ?? ''}`,
    );
  }

  const parsed = response.parsed_output;
  if (!parsed) throw new Error('model returned no parseable proposal');

  const record: ProposalRecord = {
    proposal: parsed,
    model: env.LLM_MODEL,
    profile: args.profile,
    promptExcerpt: excerpt(prompt.user),
    source: 'live',
  };

  if (env.LLM_RECORD === 1) recordFixture(args.fixture ?? args.profile, prompt, parsed);
  return record;
}

interface BuiltPrompt {
  system: string;
  user: string;
}

function buildPrompt(args: ProposeArgs): BuiltPrompt {
  const template = readFileSync(join(PROMPTS_DIR, 'system.md'), 'utf8');

  const system = template
    .replace('{{MANDATE}}', args.mandateEnglish.map((l) => `- ${l}`).join('\n'))
    .replace('{{STATE}}', args.state)
    .replace('{{SIGNALS}}', args.signals);

  return {
    system,
    user: 'Given the mandate, the current state and the signals above, give me your single next proposal.',
  };
}

function replay(args: ProposeArgs, prompt: BuiltPrompt): ProposalRecord {
  const key = args.fixture ?? args.profile;
  const path = join(FIXTURES_DIR, `${key}.json`);

  if (!existsSync(path)) {
    throw new Error(
      `LLM_MODE=replay needs a fixture at fixtures/${key}.json — record one with LLM_MODE=live LLM_RECORD=1`,
    );
  }

  const fixture = JSON.parse(readFileSync(path, 'utf8')) as { output: unknown };
  const parsed = ProposalSchema.safeParse(fixture.output);
  if (!parsed.success) {
    throw new Error(`fixtures/${key}.json is not a valid proposal: ${parsed.error.message}`);
  }

  return {
    proposal: parsed.data,
    model: `${env.LLM_MODEL} (replay)`,
    profile: args.profile,
    promptExcerpt: excerpt(prompt.system),
    source: 'replay',
  };
}

function recordFixture(key: string, prompt: BuiltPrompt, output: Proposal): void {
  const path = join(FIXTURES_DIR, `${key}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ input: prompt, output }, null, 2)}\n`);
  console.log(`[agent] recorded fixtures/${key}.json`);
}

/** The slice of the prompt the incident replay quotes, so a judge can see the poisoned headline. */
function excerpt(text: string): string {
  const signalsAt = text.indexOf('## Recent signals');
  const slice = signalsAt >= 0 ? text.slice(signalsAt, signalsAt + 600) : text.slice(0, 400);
  return slice.trim();
}
