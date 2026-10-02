import { eq, like } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import { makeApp } from "../src/app";
import { batches, documents } from "../src/db/schema";
import { BATCHES } from "../src/demo/invoice-data";
import { seedHistory } from "../src/demo/seed";
import { describeOp } from "../src/pages";
import { db, resetDb } from "./db";
import { GOOD_FIX, runBatch } from "./fixtures";

const appFor = (d: Parameters<typeof makeApp>[0]) =>
  makeApp(d, { eventSecret: "test-secret-123456", pdf: async () => Buffer.from("%PDF-1.7") });

beforeEach(async () => {
  await resetDb();
  await seedHistory(db);
});

it("describes fix operations in plain words", () => {
  expect(GOOD_FIX.map(describeOp)).toEqual([
    'Field "provider_no" also accepts the label "Provider ID"',
    'New field "gst" from the label "GST" (exact match)',
    'Compute "total" = total + gst (only when every input is present)',
  ]);
});

it("shows the batch list and the review page with verified quotes", async () => {
  const { id, d } = await runBatch("demo", BATCHES.demo());
  const app = appFor(d);
  const list = await (await app.request("/")).text();
  expect(list).toContain("demo");
  expect(list).toContain("AWAITING_REVIEW");
  const page = await (await app.request(`/batches/${id}`)).text();
  expect(page).toContain("Approve and reload");
  expect(page).toContain("First, invoice totals will exclude GST.");
  expect(page).toMatch(/provider_no.*Provider ID/);
  expect(page).toContain("review.requested");
});

it("approving from the form reloads the batch", async () => {
  const { id, d } = await runBatch("demo", BATCHES.demo());
  const res = await appFor(d).request(`/batches/${id}/approve`, { method: "POST", body: new URLSearchParams({ reviewer: "yiwei" }) });
  expect(res.status).toBe(303);
  expect((await db.select().from(batches).where(eq(batches.id, id)))[0].state).toBe("RELOADED");
});

it("document page lists fields with boxes and what they map to", async () => {
  const { d } = await runBatch("demo", BATCHES.demo());
  const [doc] = await db.select().from(documents).where(like(documents.blobPath, "%INV-10202.pdf"));
  const app = appFor(d);
  const page = await (await app.request(`/documents/${doc.id}`)).text();
  expect(page).toContain("data-polygon");
  expect(page).toContain("Provider ID");
  expect(page).toContain("not mapped"); // mapping v1 does not know "Provider ID" yet
  const pdf = await app.request(`/documents/${doc.id}/pdf`);
  expect(pdf.headers.get("content-type")).toBe("application/pdf");
});
