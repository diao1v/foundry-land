import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { batchDetail, documentView, listBatches } from "./api";
import { audit, IllegalTransition } from "./audit";
import { batches, documents } from "./db/schema";
import { batchNameFromEvent, type EGEvent } from "./events";
import { approve, processBatch, reject, ReviewError, startBatch, type Deps } from "./orchestrator";

export type AppOptions = {
  eventSecret: string;
  pdf(blobPath: string): Promise<Buffer>;
  upload(path: string, data: Buffer, contentType: string): Promise<void>; // into the "invoices" container
  webDir?: string;
  foundryAgentsUrl?: string; // Foundry portal page for the project's agents (pasted into .env)
};

const Approve = z.object({ reviewer: z.string().trim().min(1).max(40) });
const Reject = Approve.extend({ reason: z.string().trim().min(1).max(500) });
const id = (raw: string) => (/^\d+$/.test(raw) ? Number(raw) : -1); // -1 matches no row → 404

export function makeApp(deps: Deps, opts: AppOptions) {
  const { db } = deps;
  const webDir = opts.webDir ?? "web/dist";
  const app = new Hono();

  // Start a batch once (duplicate names are ignored) and process it in the background.
  const kickOff = async (name: string) => {
    const batchId = await startBatch(db, name);
    if (batchId == null) return null;
    void processBatch(deps, batchId).catch((err) =>
      audit(db, { batchId, actor: "system", action: "batch.crashed", details: { error: String(err) } }).catch(() => console.error(err)),
    );
    return batchId;
  };

  // Event Grid webhook. Shared secret in the query string (demo-level protection).
  app.post("/events/blob", async (c) => {
    if (c.req.query("key") !== opts.eventSecret) return c.text("forbidden", 403);
    const events = await c.req.json<EGEvent[]>();
    if (c.req.header("aeg-event-type") === "SubscriptionValidation") {
      const v = events.find((e) => e.eventType === "Microsoft.EventGrid.SubscriptionValidationEvent");
      return c.json({ validationResponse: v?.data.validationCode });
    }
    for (const e of events) {
      const name = batchNameFromEvent(e);
      if (!name) continue;
      await kickOff(name); // replies fast (Event Grid waits at most 30 s); duplicate deliveries are ignored
    }
    return c.body(null, 200);
  });

  app.get("/api/batches", async (c) => c.json(await listBatches(db)));

  app.get("/api/batches/by-name/:name", async (c) => {
    const [b] = await db.select({ id: batches.id, state: batches.state }).from(batches).where(eq(batches.name, c.req.param("name")));
    return b ? c.json(b) : c.json({ error: "Batch not found" }, 404);
  });

  app.get("/api/batches/:id", async (c) => {
    const r = await batchDetail(db, id(c.req.param("id")));
    return r ? c.json({ ...r, foundryAgentsUrl: opts.foundryAgentsUrl ?? null }) : c.json({ error: "Batch not found" }, 404);
  });

  app.post("/api/batches/:id/approve", async (c) => {
    const body = Approve.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Send { reviewer }" }, 400);
    await approve(deps, id(c.req.param("id")), body.data.reviewer);
    return c.json({ ok: true });
  });

  app.post("/api/batches/:id/reject", async (c) => {
    const body = Reject.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Send { reviewer, reason }" }, 400);
    await reject(deps, id(c.req.param("id")), body.data.reviewer, body.data.reason);
    return c.json({ ok: true });
  });

  const MAX_FILES = 20;
  const MAX_BYTES = 5 * 1024 * 1024;
  const bad = (c: Context, error: string) => c.json({ error }, 400);

  // Drag-and-drop upload: same Blob layout as scripts/upload-batch.ts, then start the batch.
  // On Azure, Event Grid also fires for batch.json; startBatch ignores the duplicate.
  app.post(
    "/api/uploads",
    bodyLimit({ maxSize: MAX_FILES * MAX_BYTES + 1024 * 1024, onError: (c) => c.json({ error: "Upload too large" }, 413) }),
    async (c) => {
      const raw = (await c.req.parseBody({ all: true })).files;
      const files = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((f): f is File => f instanceof File);
      if (!files.length) return bad(c, "Drop at least one PDF.");
      if (files.length > MAX_FILES) return bad(c, `At most ${MAX_FILES} files per batch.`);
      const named: { name: string; data: Buffer }[] = [];
      for (const f of files) {
        if (f.size > MAX_BYTES) return bad(c, `${f.name} is larger than 5 MB.`);
        const name = basename(f.name).replace(/[^A-Za-z0-9._-]/g, "_");
        if (!/\.pdf$/i.test(name)) return bad(c, `${f.name}: the file name must end in .pdf.`);
        const data = Buffer.from(await f.arrayBuffer());
        if (data.subarray(0, 5).toString("latin1") !== "%PDF-") return bad(c, `${f.name} is not a PDF.`);
        if (named.some((n) => n.name === name)) return bad(c, `Two files have the same name: ${name}.`);
        named.push({ name, data });
      }
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15); // yyyymmdd-hhmmss
      const batch = `upload-${stamp}-${randomBytes(2).toString("hex")}`;
      for (const n of named) await opts.upload(`${batch}/${n.name}`, n.data, "application/pdf");
      const manifest = { files: named.map((n) => n.name), uploadedAt: new Date().toISOString(), source: "web" };
      await opts.upload(`${batch}/batch.json`, Buffer.from(JSON.stringify(manifest)), "application/json");
      return c.json({ id: await kickOff(batch), name: batch });
    },
  );

  app.get("/api/documents/:id", async (c) => {
    const r = await documentView(db, id(c.req.param("id")), c.req.query("mapping") === "proposed" ? "proposed" : "batch");
    return r ? c.json(r) : c.json({ error: "Invoice not found" }, 404);
  });

  app.get("/api/documents/:id/pdf", async (c) => {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id(c.req.param("id"))));
    if (!doc) return c.json({ error: "Invoice not found" }, 404);
    return c.body(new Uint8Array(await opts.pdf(doc.blobPath)), 200, { "Content-Type": "application/pdf" });
  });

  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  // The built web app, and index.html for every other GET (client-side routes like /batches/7)
  app.use("*", serveStatic({ root: webDir }));
  app.get("*", async (c) => {
    const html = await readFile(join(webDir, "index.html"), "utf8").catch(() => null);
    return html ? c.html(html) : c.text("Web app not built. Run `pnpm build:web`, or open the Vite dev server (`pnpm dev:web`).", 404);
  });

  app.onError((err, c) => {
    if (err instanceof ReviewError || err instanceof IllegalTransition) return c.json({ error: err.message }, 409);
    // Backstop: a second mapping version with the same number (primary key) means someone approved first
    const pg = err as { code?: string; cause?: { code?: string } };
    if ((pg.code ?? pg.cause?.code) === "23505") return c.json({ error: "Already approved by someone else. Reload the page." }, 409);
    console.error(err);
    return c.json({ error: "Something went wrong. See the server log." }, 500);
  });

  return app;
}
