import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { batchDetail } from "../src/api";
import { makeApp } from "../src/app";
import { auditEvents, batches } from "../src/db/schema";
import { BATCHES, type InvoiceData } from "../src/demo/invoice-data";
import { seedHistory } from "../src/demo/seed";
import { db, resetDb } from "./db";
import { extractedDoc, fakeDeps, runBatch } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await seedHistory(db);
});

// Storage shared by the original batch and its copies: path → invoice
function setup() {
  const files = new Map<string, InvoiceData>(BATCHES.normal().map((inv) => [`b1/${inv.invoiceNo}.pdf`, inv]));
  const written: string[] = [];
  const deps = fakeDeps({}, {
    listPdfs: async (name) => [...files.keys()].filter((p) => p.startsWith(`${name}/`) && p.endsWith(".pdf")),
    extract: async (path) => extractedDoc(files.get(path)!),
  });
  const app = makeApp(deps, {
    eventSecret: "test-secret-123456",
    pdf: async (path) => Buffer.from(path), // the copy is keyed by the source path
    upload: async (path) => {
      written.push(path);
      const src = [...files.entries()].find(([p]) => p.split("/")[1] === path.split("/")[1]);
      if (src && path.endsWith(".pdf")) files.set(path, src[1]);
    },
  });
  return { app, written };
}
const rerun = (app: ReturnType<typeof makeApp>, id: number) =>
  app.request(`/api/batches/${id}/rerun`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewer: "reviewer" }) });
const stateOf = async (id: number) => (await db.select().from(batches).where(eq(batches.id, id)))[0].state;
const settle = (id: number) => vi.waitFor(async () => expect(["LOADED", "AWAITING_REVIEW", "ESCALATED"]).toContain(await stateOf(id)));

it("runs an escalated batch again as a new batch from the same PDFs, and closes the old one", async () => {
  const { app, written } = setup();
  const { id } = await runBatch("b1", BATCHES.normal(), { extract: async () => { throw new Error("DI down"); } });
  expect(await stateOf(id)).toBe("ESCALATED");

  const res = await rerun(app, id);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { id: number; name: string };
  expect(body.name).toBe("b1-run2");
  expect(written.at(-1)).toBe("b1-run2/batch.json"); // the marker goes last, like an upload
  expect(written.filter((p) => p.endsWith(".pdf"))).toHaveLength(5);

  expect(await stateOf(id)).toBe("CLOSED");
  const [ev] = await db.select().from(auditEvents).where(eq(auditEvents.action, "batch.rerun"));
  expect(ev).toMatchObject({ batchId: id, actor: "human:reviewer", details: { newBatchId: body.id, newName: "b1-run2" } });
  expect((await batchDetail(db, id))!.decision).toMatchObject({ state: "rerun", by: "reviewer", rerunAs: { id: body.id, name: "b1-run2" } });

  await settle(body.id);
  expect(await stateOf(body.id)).toBe("LOADED"); // this time Document Intelligence worked
});

it("numbers runs of a run from the original name", async () => {
  const { app } = setup();
  const { id } = await runBatch("b1", BATCHES.normal(), { extract: async () => { throw new Error("DI down"); } });
  const second = (await (await rerun(app, id)).json()) as { id: number };
  await settle(second.id);
  await db.update(batches).set({ state: "ESCALATED" }).where(eq(batches.id, second.id)); // pretend it failed again
  const third = (await (await rerun(app, second.id)).json()) as { id: number; name: string };
  expect(third.name).toBe("b1-run3");
  await settle(third.id);
});

it("refuses to run a loaded batch again", async () => {
  const { app } = setup();
  const { id } = await runBatch("b1", BATCHES.normal());
  expect(await stateOf(id)).toBe("LOADED");
  expect((await rerun(app, id)).status).toBe(409);
});
