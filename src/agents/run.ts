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

// Network errors: withRetry. Bad output: one more try with the validation error, then give up.
export async function runAgent<T>(ask: Ask, agent: string, schema: z.ZodType<T>, input: unknown): Promise<T> {
  let message = JSON.stringify(input);
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await withRetry(() => ask(agent, message));
    const result = schema.safeParse(parseJsonText(text));
    if (result.success) return result.data;
    lastError = z.prettifyError(result.error);
    message = JSON.stringify({ input, yourPreviousReplyWasInvalid: lastError, reply: "JSON only, matching the schema" });
  }
  throw new AgentOutputError(`${agent}: invalid output after retry: ${lastError}`);
}
