import { z } from 'zod';

/**
 * The only shape the model is allowed to return.
 *
 * Validated with zod before anything else looks at it. The LLM is a proposer, not an authority: a
 * malformed or out-of-range output is dropped here rather than being coerced into a signature. The
 * caps in this schema are generous on purpose — clamping a 900-dollar proposal down to the mandate
 * limit would hide exactly the misbehaviour the demo needs to show.
 */
export const ProposalSchema = z.object({
  action: z.enum(['BUY', 'SELL', 'HOLD', 'PERP_OPEN', 'PERP_CLOSE']),
  asset: z.string().min(1).max(16),
  sizeUsd: z.number().nonnegative().max(1_000_000),
  leverage: z.number().min(1).max(50),
  isLong: z.boolean().optional(),
  rationale: z.string().min(1).max(600),
  confidence: z.number().min(0).max(1),
});

export type Proposal = z.infer<typeof ProposalSchema>;

/** Recorded alongside a proposal so an incident replay can show what the model was looking at. */
export interface ProposalRecord {
  proposal: Proposal;
  model: string;
  profile: string;
  promptExcerpt: string;
  /** 'live' | 'replay' */
  source: string;
}
