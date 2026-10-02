// Full story against the running local app and real Azure:
// normal batch loads → demo batch stops with a verified fix → approve → reloaded, totals back in line.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { eq, isNull, sql } from "drizzle-orm";
import { makeDb } from "../src/db/client";
import { invoices } from "../src/db/schema";

const BASE = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT ?? 3000}`;
const sh = (cmd: string) => execSync(cmd, { stdio: "inherit" });

async function waitFor(name: string, want: string[], timeoutMs = 300_000) {
  const end = Date.now() + timeoutMs;
  let last = "none";
  while (Date.now() < end) {
    const r = await fetch(`${BASE}/api/batches/by-name/${name}`);
    if (r.ok) {
      const b = (await r.json()) as { id: number; state: string };
      last = b.state;
      if (want.includes(b.state)) return b;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`${name}: wanted ${want.join("/")}, last state ${last}`);
}

const run = Date.now().toString(36);
sh("pnpm reset-demo");
sh("pnpm notices");

sh(`pnpm upload out/batches/normal normal-${run} --post`);
const normal = await waitFor(`normal-${run}`, ["LOADED", "ESCALATED", "AWAITING_REVIEW"]);
assert.equal(normal.state, "LOADED", `normal batch: see ${BASE.replace(":3000", ":5173")}/batches/${normal.id}`);

sh(`pnpm upload out/batches/demo demo-${run} --post`);
const demo = await waitFor(`demo-${run}`, ["AWAITING_REVIEW", "ESCALATED", "LOADED"]);
assert.equal(demo.state, "AWAITING_REVIEW", `demo batch: see ${BASE.replace(":3000", ":5173")}/batches/${demo.id}`);

const res = await fetch(`${BASE}/api/batches/${demo.id}/approve`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ reviewer: "e2e" }),
});
assert.equal(res.status, 200, await res.text());
await waitFor(`demo-${run}`, ["RELOADED"], 30_000);

const db = makeDb(process.env.DATABASE_URL!);
const avg = async (where: ReturnType<typeof eq> | ReturnType<typeof isNull>) =>
  Number((await db.select({ v: sql<string>`avg(${invoices.total})` }).from(invoices).where(where))[0].v);
const batchAvg = await avg(eq(invoices.batchId, demo.id));
const historyAvg = await avg(isNull(invoices.batchId));
assert.ok(Math.abs(batchAvg - historyAvg) / historyAvg < 0.01, `average ${batchAvg} vs history ${historyAvg}`);
console.log(`E2E PASS — demo batch reloaded; average total ${batchAvg.toFixed(2)} vs history ${historyAvg.toFixed(2)}`);
await db.$client.end();
