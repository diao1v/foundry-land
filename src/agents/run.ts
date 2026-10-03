import { z } from "zod";
import { withRetry } from "../retry";

export type Ask = (agent: string, message: string) => Promise<string>;
export class AgentOutputError extends Error {}

export function parseJsonText(text: string): unknown {
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

// The agent says it failed itself, e.g. {"error":"Search required but tool call failed"} when Foundry's tool is briefly down
const agentError = (v: unknown) =>
  v && typeof v === "object" && Object.keys(v).length === 1 && typeof (v as { error?: unknown }).error === "string"
    ? (v as { error: string }).error
    : null;

// Network errors: withRetry. Agent-reported failure: wait and ask again, up to 3 times.
// Bad output: one more try with the validation error, then give up.
export async function runAgent<T>(
  ask: Ask,
  agent: string,
  schema: z.ZodType<T>,
  input: unknown,
  { waitMs = 5_000, failureRetries = 3 } = {},
): Promise<T> {
  let message = JSON.stringify(input);
  let lastError = "";
  let failures = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await withRetry(() => ask(agent, message));
    const parsed = parseJsonText(text);
    const failed = agentError(parsed);
    if (failed) {
      if (++failures > failureRetries) throw new AgentOutputError(`${agent}: ${failed}`);
      await new Promise((r) => setTimeout(r, waitMs * failures));
      attempt--; // doesn't use up the validation retry
      continue;
    }
    const result = schema.safeParse(parsed);
    if (result.success) return result.data;
    lastError = z.prettifyError(result.error);
    message = JSON.stringify({ input, yourPreviousReplyWasInvalid: lastError, reply: "JSON only, matching the schema" });
  }
  throw new AgentOutputError(`${agent}: invalid output after retry: ${lastError}`);
}
