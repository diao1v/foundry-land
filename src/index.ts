import "./telemetry"; // first, so instrumentation is in place before other modules load
import { serve } from "@hono/node-server";
import { makeAgents } from "./agents";
import { makeApp } from "./app";
import { makeBlob } from "./azure/blob";
import { analyzeLayout, toExtractedDoc } from "./azure/docint";
import { makeSearch } from "./azure/search";
import { loadConfig } from "./config";
import { makeDb } from "./db/client";
import { migrateDb } from "./db/migrate";
import type { Deps } from "./orchestrator";

const cfg = loadConfig();
await migrateDb(cfg.DATABASE_URL);
const blob = makeBlob(cfg);
const search = makeSearch(cfg);

const deps: Deps = {
  db: makeDb(cfg.DATABASE_URL),
  listPdfs: async (name) => (await blob.list("invoices", `${name}/`)).filter((p) => p.endsWith(".pdf")),
  extract: async (path) => toExtractedDoc(await analyzeLayout(cfg, await blob.download("invoices", path))),
  ...makeAgents(cfg),
  notices: () => search.all(),
  notifyReview: async (batchId) => {
    if (!cfg.REVIEW_WEBHOOK_URL) return;
    const res = await fetch(cfg.REVIEW_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId, url: `${cfg.PUBLIC_URL}/batches/${batchId}` }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`review webhook ${res.status}`);
  },
};

const app = makeApp(deps, { eventSecret: cfg.EVENT_SECRET, pdf: (path) => blob.download("invoices", path) });
serve({ fetch: app.fetch, port: cfg.PORT });
console.log(`foundry-land running on ${cfg.PUBLIC_URL}`);
