import type { Notice } from "../agents/citations";
import type { Config } from "../config";
import { tokenFor } from "./auth";

const searchToken = tokenFor("https://search.azure.com/.default");
const INDEX = {
  name: "notices",
  fields: [
    { name: "id", type: "Edm.String", key: true, filterable: true },
    { name: "title", type: "Edm.String", searchable: true },
    { name: "content", type: "Edm.String", searchable: true },
  ],
};

export function makeSearch(cfg: Pick<Config, "SEARCH_ENDPOINT" | "SEARCH_ADMIN_KEY">) {
  const base = cfg.SEARCH_ENDPOINT.replace(/\/$/, "");
  const call = async (method: string, path: string, body?: unknown) => {
    const auth: Record<string, string> = cfg.SEARCH_ADMIN_KEY
      ? { "api-key": cfg.SEARCH_ADMIN_KEY }
      : { Authorization: `Bearer ${await searchToken()}` };
    const r = await fetch(`${base}/${path}?api-version=2024-07-01`, {
      method,
      headers: { ...auth, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`Search ${method} ${path}: ${r.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  return {
    createIndex: () => call("PUT", "indexes/notices", INDEX),
    upsert: (docs: Notice[]) =>
      call("POST", "indexes/notices/docs/index", { value: docs.map((d) => ({ "@search.action": "mergeOrUpload", ...d })) }),
    remove: (ids: string[]) =>
      call("POST", "indexes/notices/docs/index", { value: ids.map((id) => ({ "@search.action": "delete", id })) }),
    all: async () =>
      (await call("POST", "indexes/notices/docs/search", { search: "*", select: "id,title,content", top: 50 })).value as Notice[],
  };
}
export type Search = ReturnType<typeof makeSearch>;
