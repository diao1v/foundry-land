import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import { IllegalTransition, transition } from "../src/audit";
import { auditEvents, batches, invoices, mappingVersions } from "../src/db/schema";
import { resetDemo, seedHistory } from "../src/demo/seed";
import { canTransition } from "../src/state";
import { db, resetDb } from "./db";
import { V1 } from "./fixtures";

beforeEach(resetDb);

it("allows only listed transitions", () => {
  expect(canTransition("CHECKED", "LOADED")).toBe(true);
  expect(canTransition("DRY_RUN", "PROPOSED")).toBe(true);
  expect(canTransition("RECEIVED", "LOADED")).toBe(false);
  expect(canTransition("LOADED", "CLOSED")).toBe(false);
});

it("moves the batch and writes an audit row", async () => {
  const [b] = await db.insert(batches).values({ name: "b1" }).returning();
  await transition(db, b.id, "EXTRACTED", "system", "batch.extracted", { documents: 3 });
  expect((await db.select().from(batches))[0].state).toBe("EXTRACTED");
  expect((await db.select().from(auditEvents))[0]).toMatchObject({
    batchId: b.id, actor: "system", action: "batch.extracted", details: { documents: 3 },
  });
});

it("refuses an illegal transition and writes nothing", async () => {
  const [b] = await db.insert(batches).values({ name: "b1" }).returning();
  await expect(transition(db, b.id, "LOADED", "system", "x")).rejects.toThrow(IllegalTransition);
  expect((await db.select().from(batches))[0].state).toBe("RECEIVED");
  expect(await db.$count(auditEvents)).toBe(0);
});

it("lets only one of two competing transitions win", async () => {
  const [b] = await db.insert(batches).values({ name: "b2", state: "AWAITING_REVIEW" }).returning();
  const results = await Promise.allSettled([
    transition(db, b.id, "CLOSED", "human:a", "review.rejected"),
    transition(db, b.id, "RELOADED", "human:b", "batch.reloaded"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await db.$count(auditEvents)).toBe(1);
});

it("resetDemo removes batches, their invoices and later mappings, and keeps history", async () => {
  await seedHistory(db);
  const [b] = await db.insert(batches).values({ name: "demo-x", state: "RELOADED" }).returning();
  await db.insert(invoices).values({ providerNo: "EO-20417", invoiceNo: "INV-X", total: 1, batchId: b.id });
  await db.insert(mappingVersions).values({ version: 2, mapping: V1, createdBy: "t", reason: "t" });
  await db.update(mappingVersions).set({ mapping: { ...V1, ignore: [] } }).where(eq(mappingVersions.version, 1));
  await resetDemo(db);
  expect(await db.$count(batches)).toBe(0);
  expect(await db.$count(invoices)).toBe(60);
  expect((await db.select().from(mappingVersions)).map((v) => [v.version, v.mapping])).toEqual([[1, V1]]);
});
