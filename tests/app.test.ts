import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { makeApp } from "../src/app";
import { batches } from "../src/db/schema";
import { blobCreatedEvent } from "../src/events";
import { db, resetDb } from "./db";
import { fakeDeps } from "./fixtures";

const SECRET = "test-secret-123456";
const app = () => makeApp(fakeDeps({}), { eventSecret: SECRET, pdf: async () => Buffer.from("%PDF") });
const post = (body: unknown, headers: Record<string, string> = {}, key = SECRET) =>
  app().request(`/events/blob?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(resetDb);

it("answers the Event Grid validation handshake", async () => {
  const res = await post(
    [{ id: "1", subject: "", eventType: "Microsoft.EventGrid.SubscriptionValidationEvent", data: { validationCode: "abc" } }],
    { "aeg-event-type": "SubscriptionValidation" },
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ validationResponse: "abc" });
});

it("refuses a wrong key", async () => {
  expect((await post(blobCreatedEvent("b1/batch.json"), {}, "wrong")).status).toBe(403);
});

it("starts one batch per batch.json, even when the event arrives twice", async () => {
  expect((await post(blobCreatedEvent("b1/batch.json"))).status).toBe(200);
  expect((await post(blobCreatedEvent("b1/batch.json"))).status).toBe(200);
  const rows = await db.select().from(batches);
  expect(rows.map((b) => b.name)).toEqual(["b1"]);
  // fakeDeps({}) has no PDFs, so the background run escalates; wait for it
  await vi.waitFor(async () => {
    expect((await db.select().from(batches).where(eq(batches.name, "b1")))[0].state).toBe("ESCALATED");
  });
});

it("ignores single PDF uploads", async () => {
  await post(blobCreatedEvent("b1/INV-1.pdf"));
  expect(await db.$count(batches)).toBe(0);
});

it("returns batch state as JSON", async () => {
  await db.insert(batches).values({ name: "b9", state: "LOADED" });
  expect(await (await app().request("/api/batches/b9")).json()).toEqual({ id: 1, state: "LOADED" });
  expect((await app().request("/api/batches/nope")).status).toBe(404);
});

it("answers 409 when approving a batch that is not waiting for review", async () => {
  await db.insert(batches).values({ name: "b9", state: "LOADED" });
  const res = await app().request("/batches/1/approve", { method: "POST", body: new URLSearchParams({ reviewer: "yiwei" }) });
  expect(res.status).toBe(409);
});
