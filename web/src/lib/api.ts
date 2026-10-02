export type { BatchDetail, BatchListResponse, BatchRow, Decision, DocumentView } from "../../../src/api";
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
