import { z } from "zod";
import { FixOp } from "../fix";

export const DriftReport = z.object({
  findings: z.array(
    z.object({
      kind: z.enum(["rename", "new_field", "meaning_change", "noise"]),
      field: z.string().nullable(),
      labels: z.array(z.string()),
      evidence: z.string(),
    }),
  ),
  severity: z.enum(["INFO", "WARNING", "BREAKING"]),
  impact: z.string(),
});
export type DriftReport = z.infer<typeof DriftReport>;

const CitationSchema = z.object({ docId: z.string(), quote: z.string() });
export type Citation = z.infer<typeof CitationSchema>;

export const Investigation = z.object({
  explanationFound: z.boolean(),
  explanation: z.string(),
  citations: z.array(CitationSchema),
  unexplained: z.array(z.string()),
});
export type Investigation = z.infer<typeof Investigation>;
export type VerifiedInvestigation = Investigation & { verifiedCitations: Citation[]; rejectedCitations: Citation[] };

export const FixProposal = z.object({
  operations: z.array(FixOp).min(1).max(5),
  reasoning: z.string(),
});
export type FixProposal = z.infer<typeof FixProposal>;
