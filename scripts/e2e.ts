// Full story against the running local app and real Azure:
// normal batch loads → demo batch stops with a verified fix → approve → reloaded, totals back in line.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { eq } from "drizzle-orm";
import { makeDb } from "../src/db/client";
import { invoices } from "../src/db/schema";

const BASE = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT ?? 3000}`;
// The deployed app asks for the shared password (HTTP Basic Auth, user "demo")
const AUTH: Record<string, string> = process.env.DEMO_PASSWORD
  ? { Authorization: `Basic ${Buffer.from(`demo:${process.env.DEMO_PASSWORD}`).toString("base64")}` }
  : {};
const sh = (cmd: string) => execSync(cmd, { stdio: "inherit" });

async function waitFor(name: string, want: string[], timeoutMs = 300_000) {
  const end = Date.now() + timeoutMs;
  let last = "none";
  while (Date.now() < end) {
    const r = await fetch(`${BASE}/api/batches/by-name/${name}`, { headers: AUTH });
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
  headers: { "Content-Type": "application/json", ...AUTH },
  body: JSON.stringify({ reviewer: "e2e" }),
});
assert.equal(res.status, 200, await res.text());
await waitFor(`demo-${run}`, ["RELOADED"], 30_000);

const db = makeDb(process.env.DATABASE_URL!);
const rows = await db.select().from(invoices).where(eq(invoices.batchId, demo.id));
assert.equal(rows.length, 10, `reloaded ${rows.length} invoices, expected 10`);
// New-layout invoices (they have a GST line) must be stored GST-inclusive, like the history
const withGst = rows.filter((r) => r.gst != null);
assert.ok(withGst.length > 0, "no invoice with a GST line");
for (const r of withGst) assert.ok(Math.abs(r.total / (r.total - r.gst!) - 1.15) < 0.001, `${r.invoiceNo}: total ${r.total} is not GST-inclusive`);
console.log(`E2E PASS — demo batch reloaded; ${rows.length} invoices, ${withGst.length} new-layout totals stored GST-inclusive`);
await db.$client.end();
