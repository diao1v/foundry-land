import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { makeApp } from "../src/app";
import { batches, mappingVersions } from "../src/db/schema";
import { BATCHES } from "../src/demo/invoice-data";
import { seedHistory } from "../src/demo/seed";
import { blobCreatedEvent } from "../src/events";
import { db, resetDb } from "./db";
import { fakeDeps, runBatch } from "./fixtures";

const SECRET = "test-secret-123456";
const webDir = mkdtempSync(join(tmpdir(), "web-"));
writeFileSync(join(webDir, "index.html"), "<!doctype html><title>foundry-land</title><div id=root></div>");
const app = (d = fakeDeps({})) => makeApp(d, { eventSecret: SECRET, pdf: async () => Buffer.from("%PDF"), upload: async () => {}, webDir });
const post = (body: unknown, headers: Record<string, string> = {}, key = SECRET) =>
  app().request(`/events/blob?key=${key}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(async () => {
  await resetDb();
  await seedHistory(db);
});

it("answers the Event Grid validation handshake", async () => {
  const res = await post(
    [{ id: "1", subject: "", eventType: "Microsoft.EventGrid.SubscriptionValidationEvent", data: { validationCode: "abc" } }],
    { "aeg-event-type": "SubscriptionValidation" },
  );
  expect(await res.json()).toEqual({ validationResponse: "abc" });
});

it("refuses a wrong key", async () => {
  expect((await post(blobCreatedEvent("b1/batch.json"), {}, "wrong")).status).toBe(403);
});

it("starts one batch per batch.json, even when the event arrives twice", async () => {
  await post(blobCreatedEvent("b1/batch.json"));
  await post(blobCreatedEvent("b1/batch.json"));
  expect((await db.select().from(batches)).map((b) => b.name)).toEqual(["b1"]);
  await vi.waitFor(async () => {
    expect((await db.select().from(batches).where(eq(batches.name, "b1")))[0].state).toBe("ESCALATED");
  });
});

it("ignores single PDF uploads", async () => {
  await post(blobCreatedEvent("b1/INV-1.pdf"));
  expect(await db.$count(batches)).toBe(0);
});

it("finds a batch by name", async () => {
  await db.insert(batches).values({ name: "b9", state: "LOADED" });
  expect(await (await app().request("/api/batches/by-name/b9")).json()).toEqual({ id: 1, state: "LOADED" });
  expect((await app().request("/api/batches/by-name/nope")).status).toBe(404);
});

it("serves the list, detail and document JSON, and 404 for unknown ids", async () => {
  const { id, d } = await runBatch("demo", BATCHES.demo());
  const a = app(d);
  expect((await (await a.request("/api/batches")).json()).batches[0].name).toBe("demo");
  const detail = await (await a.request(`/api/batches/${id}`)).json();
  expect(detail.decision.state).toBe("waiting");
  const docId = detail.documents[2].id;
  expect((await (await a.request(`/api/documents/${docId}?mapping=proposed`)).json()).mapping.shown).toBe("proposed");
  expect((await a.request(`/api/documents/${docId}/pdf`)).headers.get("content-type")).toBe("application/pdf");
  expect((await a.request("/api/batches/999")).status).toBe(404);
  expect((await a.request("/api/documents/999")).status).toBe(404);
});

it("approves with JSON once; a second approval answers 409 with a message", async () => {
  const { id, d } = await runBatch("demo", BATCHES.demo());
  const a = app(d);
  expect((await a.request(`/api/batches/${id}/approve`, json({ reviewer: "yiwei" }))).status).toBe(200);
  const again = await a.request(`/api/batches/${id}/approve`, json({ reviewer: "yiwei" }));
  expect(again.status).toBe(409);
  expect((await again.json()).error).toMatch(/not AWAITING_REVIEW/);
  expect(await db.$count(mappingVersions)).toBe(2);
});

it("rejects with JSON; a missing reason answers 400", async () => {
  const { id, d } = await runBatch("demo", BATCHES.demo());
  const a = app(d);
  expect((await a.request(`/api/batches/${id}/reject`, json({ reviewer: "yiwei" }))).status).toBe(400);
  expect((await a.request(`/api/batches/${id}/reject`, json({ reviewer: "yiwei", reason: "wrong provider" }))).status).toBe(200);
  expect((await db.select().from(batches).where(eq(batches.id, id)))[0].state).toBe("CLOSED");
});

it("serves the web app for page URLs (SPA fallback), but not for unknown API routes", async () => {
  const page = await app().request("/batches/7");
  expect(page.status).toBe(200);
  expect(await page.text()).toContain("<title>foundry-land</title>");
  expect((await app().request("/api/nope")).status).toBe(404);
});

it("two approvals at the same moment: one succeeds, the other gets a clear 409, one new mapping version", async () => {
  const { id, d } = await runBatch("demo", BATCHES.demo());
  const a = app(d);
  const [r1, r2] = await Promise.all([
    a.request(`/api/batches/${id}/approve`, json({ reviewer: "yiwei" })),
    a.request(`/api/batches/${id}/approve`, json({ reviewer: "sam" })),
  ]);
  expect([r1.status, r2.status].sort()).toEqual([200, 409]);
  const loser = r1.status === 409 ? r1 : r2;
  expect((await loser.json()).error).toMatch(/not AWAITING_REVIEW/);
  expect(await db.$count(mappingVersions)).toBe(2);
});
