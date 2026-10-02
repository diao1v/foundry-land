import { eq, like } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import { batchDetail, documentView, listBatches } from "../src/api";
import { documents } from "../src/db/schema";
import { BATCHES } from "../src/demo/invoice-data";
import { seedHistory } from "../src/demo/seed";
import { approve } from "../src/orchestrator";
import { db, resetDb } from "./db";
import { runBatch } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await seedHistory(db);
});

const docId = async (file: string) =>
  (await db.select().from(documents).where(like(documents.blobPath, `%${file}`)))[0].id;

it("lists batches with a summary and averages vs history", async () => {
  await runBatch("normal", BATCHES.normal());
  await runBatch("demo", BATCHES.demo());
  const r = await listBatches(db);
  expect(r.summary).toEqual({ waitingForReview: 1, invoicesLoaded: 5, currentMapping: 1, history: { avgTotal: 993.6, count: 60 } });
  const [demo, normal] = r.batches; // newest first
  expect(demo).toMatchObject({ name: "demo", state: "AWAITING_REVIEW", invoices: 10, avgTotal: 895.95 });
  expect(demo.changeVsHistory).toBeCloseTo(-0.0983, 3);
  expect(demo.steps.map((s) => s.status)).toEqual(["failed", "done", "done", "done", "waiting"]);
  expect(normal).toMatchObject({ name: "normal", state: "LOADED", invoices: 5, avgTotal: 993.6, changeVsHistory: 0 });
});

it("shows the reloaded average after approval", async () => {
  const { id, d } = await runBatch("demo", BATCHES.demo());
  await approve(d, id, "yiwei");
  const [row] = (await listBatches(db)).batches;
  expect(row).toMatchObject({ state: "RELOADED", avgTotal: 993.6, changeVsHistory: 0 });
});

it("batch detail: steps, decision, proposals and flagged invoices", async () => {
  const { id } = await runBatch("demo", BATCHES.demo());
  const r = (await batchDetail(db, id))!;
  expect(r.provider).toBe("Example Orthopaedics Ltd");
  expect(r.steps.map((s) => s.key)).toEqual(["checks", "analyst", "investigator", "fix", "decision"]);
  expect(r.decision).toMatchObject({ state: "waiting", proposal: { round: 1, dryRunAvg: 993.6 } });
  expect(r.decision.proposal!.described).toHaveLength(3);
  expect(r.proposals[0]).toMatchObject({ round: 1, passed: true, rejectedReason: null });
  expect(r.documents).toHaveLength(10);
  expect(r.documents.find((x) => x.name === "INV-10202")!.flaggedBy).toContain("schema");
  expect(r.documents.find((x) => x.name === "INV-10200")!.flaggedBy).toEqual([]);
  expect(r.events.at(-1)!.action).toBe("review.requested");
  expect(typeof r.events[0].at).toBe("string");
});

it("batch detail after approval reports who decided and the result", async () => {
  const { id, d } = await runBatch("demo", BATCHES.demo());
  await approve(d, id, "yiwei");
  const r = (await batchDetail(db, id))!;
  expect(r.decision).toMatchObject({
    state: "approved", by: "yiwei",
    result: { from: 1, to: 2, invoices: 10, avgTotal: 993.6, changeVsHistory: 0 },
  });
});

it("batch detail of an escalated batch gives the reason", async () => {
  const { id } = await runBatch("demo", BATCHES.demo(), { drift: async () => { throw new Error("503"); } });
  const r = (await batchDetail(db, id))!;
  expect(r.decision).toMatchObject({ state: "escalated", reason: "Agent unavailable: drift-analyst" });
});

it("normal batch detail: decision not needed", async () => {
  const { id } = await runBatch("normal", BATCHES.normal());
  expect((await batchDetail(db, id))!.decision.state).toBe("not_needed");
});

it("returns null for unknown ids", async () => {
  expect(await batchDetail(db, 999)).toBeNull();
  expect(await documentView(db, 999, "batch")).toBeNull();
});

it("document view with the batch mapping: unmapped labels, prefix match, position and the note", async () => {
  await runBatch("demo", BATCHES.demo());
  const r = (await documentView(db, await docId("INV-10202.pdf"), "batch"))!;
  expect(r.position).toMatchObject({ index: 3, total: 10 });
  expect(r.position.prevId).not.toBeNull();
  expect(r.mapping).toEqual({ shown: "batch", version: 1, proposedAvailable: true });
  const by = (label: string) => r.fields.find((f) => f.label === label)!;
  expect(by("Provider ID").field).toBeNull();
  expect(by("Total (excl. GST)")).toMatchObject({ field: "total", matchedBy: "prefix" });
  expect(r.mappedCount).toBe(r.fields.length - 2);
  expect(r.note).toBe(
    'Mapping v1 reads "total" from any label starting with "Total", so $440.00 maps without a warning even though the label says "Total (excl. GST)". Only the value check (−9.8% vs history) catches it.',
  );
});

it("document view: no note on an old-layout invoice", async () => {
  await runBatch("demo", BATCHES.demo());
  expect((await documentView(db, await docId("INV-10200.pdf"), "batch"))!.note).toBeNull();
});

it("document view with the proposed mapping: renamed and new fields map, derived total computed", async () => {
  await runBatch("demo", BATCHES.demo());
  const r = (await documentView(db, await docId("INV-10202.pdf"), "proposed"))!;
  expect(r.mapping.shown).toBe("proposed");
  expect(r.fields.find((f) => f.label === "Provider ID")!.field).toBe("provider_no");
  expect(r.fields.find((f) => f.label === "GST")!.field).toBe("gst");
  expect(r.derived).toEqual([{ field: "total", expression: "total + gst", value: "506.00" }]);
  expect(r.note).toBeNull();
});

it("falls back to the batch mapping when no proposal passed", async () => {
  const { id } = await runBatch("normal", BATCHES.normal());
  const [doc] = await db.select().from(documents).where(eq(documents.batchId, id));
  const r = (await documentView(db, doc.id, "proposed"))!;
  expect(r.mapping).toMatchObject({ shown: "batch", proposedAvailable: false });
});
