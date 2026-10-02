import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { audit, IllegalTransition } from "./audit";
import { batches } from "./db/schema";
import { batchNameFromEvent, type EGEvent } from "./events";
import { approve, processBatch, reject, ReviewError, startBatch, type Deps } from "./orchestrator";

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

  app.onError((err, c) => {
    if (err instanceof ReviewError || err instanceof IllegalTransition) return c.text(err.message, 409);
    console.error(err);
    return c.text("Something went wrong. See the server log.", 500);
  });

  return app;
}
