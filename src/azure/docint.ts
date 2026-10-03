import type { Config } from "../config";
import { type LineItem, normalizeLabel, type RawField } from "../mapping/mapping";
import { parseMoney, round2 } from "../mapping/money";
import { tokenFor } from "./auth";

type Region = { pageNumber: number; polygon: number[] }; // flat [x1,y1,…,x4,y4], page units (inch for PDF)
type KvElement = { content: string; boundingRegions?: Region[] };
type Table = { cells: { rowIndex: number; columnIndex: number; content: string }[] };
export type AnalyzeResult = {
  content: string;
  pages: { pageNumber: number; width: number; height: number; unit: string }[];
  keyValuePairs?: { key: KvElement; value?: KvElement; confidence: number }[];
  tables?: Table[];
};
export type ExtractedField = RawField & { page: number; polygon: number[] };
export type ExtractedDoc = {
  pageWidth: number; pageHeight: number; unit: string; fields: ExtractedField[];
  lineItemsTotal: number | null; // null when any fee is unreadable
  lineItems: LineItem[]; // readable rows only
};

const docintToken = tokenFor("https://cognitiveservices.azure.com/.default");
const API = "api-version=2024-11-30";

// F0 tier has a low call rate. On 429, wait as long as the service asks (max 60 s), then try again.
async function fetchPatient(url: string, init: RequestInit, timeoutMs: number, tries = 6): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status !== 429 || attempt >= tries) return res;
    const retryAfter = res.headers.get("retry-after");
    await new Promise((r) => setTimeout(r, Math.min(retryAfter == null ? 30 : Number(retryAfter) || 0, 60) * 1000));
  }
}

export async function analyzeLayout(cfg: Pick<Config, "DOCINT_ENDPOINT" | "DOCINT_KEY">, pdf: Buffer): Promise<AnalyzeResult> {
  const base = cfg.DOCINT_ENDPOINT.replace(/\/$/, "");
  const auth: Record<string, string> = cfg.DOCINT_KEY
    ? { "Ocp-Apim-Subscription-Key": cfg.DOCINT_KEY }
    : { Authorization: `Bearer ${await docintToken()}` };
  const post = await fetchPatient(
    `${base}/documentintelligence/documentModels/prebuilt-layout:analyze?${API}&features=keyValuePairs&pages=1`,
    { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ base64Source: pdf.toString("base64") }) },
    30_000,
  );
  const op = post.headers.get("Operation-Location");
  if (post.status !== 202 || !op) throw new Error(`Document Intelligence ${post.status}: ${(await post.text()).slice(0, 300)}`);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const r = (await (await fetchPatient(op, { headers: auth }, 15_000)).json()) as {
      status: string;
      error?: { message?: string };
      analyzeResult?: AnalyzeResult;
    };
    if (r.status === "succeeded" && r.analyzeResult) return r.analyzeResult;
    if (r.status === "failed") throw new Error(`Document Intelligence failed: ${r.error?.message ?? ""}`);
  }
  throw new Error("Document Intelligence timed out after 60s");
}

// DI marks checkbox-like glyphs in text as ":selected:" / ":unselected:"; they are not part of the content
const clean = (text: string) => text.replace(/:(un)?selected:/g, "").replace(/\s+/g, " ").trim();

// The fee table: a "Fee" column (required) and a "Description" column (optional)
function lineItemsFrom(tables: Table[]): { items: LineItem[]; total: number | null } {
  for (const t of tables) {
    const header = (name: string) => t.cells.find((c) => c.rowIndex === 0 && c.content.trim() === name);
    const feeCol = header("Fee");
    if (!feeCol) continue;
    const descCol = header("Description");
    const rows = [...new Set(t.cells.filter((c) => c.rowIndex > 0).map((c) => c.rowIndex))];
    const parsed = rows.map((row) => {
      const cell = (col?: { columnIndex: number }) => t.cells.find((c) => c.rowIndex === row && c.columnIndex === col?.columnIndex);
      return { description: clean(cell(descCol)?.content ?? ""), fee: parseMoney(clean(cell(feeCol)?.content ?? "")) };
    });
    const items = parsed.filter((p): p is LineItem => p.fee != null);
    const total = parsed.length && items.length === parsed.length ? round2(items.reduce((a, b) => a + b.fee, 0)) : null;
    return { items, total };
  }
  return { items: [], total: null };
}

export function toExtractedDoc(r: AnalyzeResult): ExtractedDoc {
  const page = r.pages[0];
  // DI sometimes also reads table rows as key-value pairs ("General inspection: $74.75"), or just the start
  // of a cell ("General"). Those are line items, not fields.
  const cells = (r.tables ?? []).flatMap((t) => t.cells.map((c) => normalizeLabel(c.content)));
  const pairs = (r.keyValuePairs ?? []).filter((kv) => !cells.some((c) => c.startsWith(normalizeLabel(kv.key.content))));
  const fields = pairs.map((kv) => {
    const region = kv.value?.boundingRegions?.[0] ?? kv.key.boundingRegions?.[0];
    return {
      label: normalizeLabel(kv.key.content),
      value: kv.value?.content ?? "",
      confidence: kv.confidence,
      page: region?.pageNumber ?? 1,
      polygon: region?.polygon ?? [],
    };
  });
  const { items, total } = lineItemsFrom(r.tables ?? []);
  return { pageWidth: page.width, pageHeight: page.height, unit: page.unit, fields, lineItemsTotal: total, lineItems: items };
}
