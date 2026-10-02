import { trace } from "@opentelemetry/api";
import { and, eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { auditEvents, batches } from "./db/schema";
import { canTransition, type BatchState } from "./state";
import { tracer } from "./telemetry";

export class IllegalTransition extends Error {
  constructor(from: string, to: string, why = "not allowed") {
    super(`Illegal transition ${from} → ${to} (${why})`);
  }
}

export async function audit(db: Db, e: { batchId: number | null; actor: string; action: string; details?: unknown }) {
  const traceId = trace.getActiveSpan()?.spanContext().traceId ?? null;
  await db.insert(auditEvents).values({ ...e, details: e.details ?? {}, traceId });
}

// Every state change goes through here: check → update (only if the state is unchanged) → audit row.
export async function transition(db: Db, batchId: number, to: BatchState, actor: string, action: string, details: unknown = {}) {
  await tracer.startActiveSpan(`batch.${to.toLowerCase()}`, async (span) => {
    try {
      const [b] = await db.select({ state: batches.state }).from(batches).where(eq(batches.id, batchId));
      if (!b) throw new Error(`Batch ${batchId} not found`);
      if (!canTransition(b.state, to)) throw new IllegalTransition(b.state, to);
      span.setAttributes({ "batch.id": batchId, "batch.from": b.state, "batch.to": to, "audit.actor": actor });
      const updated = await db
        .update(batches)
        .set({ state: to, updatedAt: new Date() })
        .where(and(eq(batches.id, batchId), eq(batches.state, b.state)))
        .returning({ id: batches.id });
      if (!updated.length) throw new IllegalTransition(b.state, to, "state changed at the same time");
      await audit(db, { batchId, actor, action, details });
    } finally {
      span.end();
    }
  });
}
