import type { Config } from "../config";
import { tokenFor } from "./auth";

type FoundryCfg = Pick<Config, "FOUNDRY_PROJECT_ENDPOINT">;
const API = "api-version=2025-11-15-preview";
const foundryToken = tokenFor("https://ai.azure.com/.default");
const headers = async () => ({
  Authorization: `Bearer ${await foundryToken()}`,
  "Content-Type": "application/json",
  "Foundry-Features": "AgentEndpoints=V1Preview",
});

export async function foundryCall(cfg: FoundryCfg, method: string, path: string, body?: unknown) {
  const url = `${cfg.FOUNDRY_PROJECT_ENDPOINT}${path}${path.includes("?") ? "&" : "?"}${API}`;
  const res = await fetch(url, {
    method,
    headers: await headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`${method} ${path}: ${res.status} ${text.slice(0, 500)}`), { status: res.status });
  return text ? JSON.parse(text) : null;
}

// New version if the agent exists, otherwise create it.
export async function createVersion(cfg: FoundryCfg, agent: string, definition: unknown): Promise<{ version: string }> {
  try {
    return await foundryCall(cfg, "POST", `/agents/${agent}/versions`, { definition });
  } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
    return (await foundryCall(cfg, "POST", "/agents", { name: agent, definition })).versions.latest;
  }
}

export type ResponseBody = {
  error?: { message?: string } | null;
  output?: Array<{ type: string; content?: Array<{ text?: string }> }>;
};

export const responseText = (body: ResponseBody) =>
  (body.output ?? [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .map((c) => c.text ?? "")
    .filter(Boolean)
    .join("\n");

export async function askAgent(cfg: FoundryCfg, agent: string, input: string): Promise<string> {
  const res = await fetch(`${cfg.FOUNDRY_PROJECT_ENDPOINT}/agents/${agent}/endpoint/protocols/openai/responses?${API}`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify({ input, max_output_tokens: 8000 }), // cost guard; reasoning models spend part of it on hidden reasoning
    signal: AbortSignal.timeout(90_000),
  });
  const body = (await res.json().catch(() => ({}))) as ResponseBody;
  if (!res.ok || body.error) throw new Error(`agent ${agent}: ${res.status} ${body.error?.message ?? ""}`.trim());
  return responseText(body);
}
