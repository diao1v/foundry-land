import type { BatchDetail as ServerBatchDetail } from "../../../src/api";
import type { AgentUrls } from "../../../src/app";
export type { BatchListResponse, BatchRow, Decision, DocumentView, LoadedRow } from "../../../src/api";
export type BatchDetail = ServerBatchDetail & { foundryAgentUrls: AgentUrls };
export type { Step, StepKey, StepStatus } from "../../../src/steps";

export const REVIEWER = "yiwei"; // no login in the demo

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new HttpError(res.status, ((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText);
  return (await res.json()) as T;
}

export async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText);
}

export type { ChatReply } from "../../../src/chat";

export async function postJsonFor<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  // a gateway timeout has no JSON body (and often no status text): say it plainly
  if (!res.ok) throw new Error(data.error ?? "The server took too long to answer. Try again in a minute.");
  return data;
}
