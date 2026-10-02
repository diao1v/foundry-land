import { serveStatic } from "@hono/node-server/serve-static";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { audit, IllegalTransition } from "./audit";
import { auditEvents, batches, documents, extractedFields, fixProposals, incidents, mappingVersions } from "./db/schema";
import { batchNameFromEvent, type EGEvent } from "./events";
import { fieldForLabel, Mapping } from "./mapping/mapping";
import { approve, processBatch, reject, ReviewError, startBatch, type Deps } from "./orchestrator";
import { BatchList, BatchPage, DocumentPage } from "./pages";

export type AppOptions = { eventSecret: string; pdf(blobPath: string): Promise<Buffer> };

export function makeApp(deps: Deps, opts: AppOptions) {
  const { db } = deps;
  const app = new Hono();

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
      const id = await startBatch(db, name);
      if (id == null) continue; // duplicate delivery
      // Reply fast (Event Grid waits at most 30 s); process in the background.
      void processBatch(deps, id).catch((err) =>
        audit(db, { batchId: id, actor: "system", action: "batch.crashed", details: { error: String(err) } }).catch(() =>
          console.error(err),
        ),
      );
    }
    return c.body(null, 200);
  });

  app.get("/api/batches/:name", async (c) => {
    const [b] = await db
      .select({ id: batches.id, state: batches.state })
      .from(batches)
      .where(eq(batches.name, c.req.param("name")));
    return b ? c.json(b) : c.json({ error: "not found" }, 404);
  });

  app.post("/batches/:id/approve", async (c) => {
    const form = await c.req.parseBody();
    await approve(deps, Number(c.req.param("id")), String(form.reviewer || "reviewer"));
    return c.redirect(`/batches/${c.req.param("id")}`, 303);
  });

  app.post("/batches/:id/reject", async (c) => {
    const form = await c.req.parseBody();
    await reject(deps, Number(c.req.param("id")), String(form.reviewer || "reviewer"), String(form.reason || "no reason given"));
    return c.redirect(`/batches/${c.req.param("id")}`, 303);
  });

  app.use("/public/*", serveStatic({ root: "./" }));

  app.get("/", async (c) => c.html(<BatchList rows={await db.select().from(batches).orderBy(desc(batches.id))} />));

  app.get("/batches/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const [batch] = await db.select().from(batches).where(eq(batches.id, id));
    if (!batch) return c.notFound();
    const [incident] = await db.select().from(incidents).where(eq(incidents.batchId, id));
    const proposals = incident
      ? await db.select().from(fixProposals).where(eq(fixProposals.incidentId, incident.id)).orderBy(fixProposals.round)
      : [];
    const docs = await db.select().from(documents).where(eq(documents.batchId, id)).orderBy(documents.id);
    const events = await db.select().from(auditEvents).where(eq(auditEvents.batchId, id)).orderBy(auditEvents.id);
    return c.html(<BatchPage batch={batch} incident={incident} proposals={proposals} docs={docs} events={events} />);
  });

  app.get("/documents/:id", async (c) => {
    const [doc] = await db.select().from(documents).where(eq(documents.id, Number(c.req.param("id"))));
    if (!doc) return c.notFound();
    const [batch] = await db.select().from(batches).where(eq(batches.id, doc.batchId));
    const [m] = await db.select().from(mappingVersions).where(eq(mappingVersions.version, batch.mappingVersion ?? 1));
    const mapping = Mapping.parse(m.mapping);
    const fields = await db.select().from(extractedFields).where(eq(extractedFields.documentId, doc.id)).orderBy(extractedFields.id);
    return c.html(<DocumentPage doc={doc} batch={batch} rows={fields.map((f) => ({ ...f, field: fieldForLabel(mapping, f.label) }))} />);
  });

  app.get("/documents/:id/pdf", async (c) => {
    const [doc] = await db.select().from(documents).where(eq(documents.id, Number(c.req.param("id"))));
    if (!doc) return c.notFound();
    return c.body(new Uint8Array(await opts.pdf(doc.blobPath)), 200, { "Content-Type": "application/pdf" });
  });

  app.onError((err, c) => {
    if (err instanceof ReviewError || err instanceof IllegalTransition) return c.text(err.message, 409);
    console.error(err);
    return c.text("Something went wrong. See the server log.", 500);
  });

  return app;
}
