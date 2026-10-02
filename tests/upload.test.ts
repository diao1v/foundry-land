import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { makeApp } from "../src/app";
import { batches } from "../src/db/schema";
import { db, resetDb } from "./db";
import { fakeDeps } from "./fixtures";

let uploads: string[] = [];
const app = () =>
  makeApp(fakeDeps({}), {
    eventSecret: "test-secret-123456",
    pdf: async () => Buffer.from("%PDF"),
    webDir: mkdtempSync(join(tmpdir(), "web-")),
    upload: async (path) => { uploads.push(path); },
  });
const pdf = (name: string, body: string | Uint8Array<ArrayBuffer> = "%PDF-1.7 fictional") => new File([body], name, { type: "application/pdf" });
const send = (files: File[]) => {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  return app().request("/api/uploads", { method: "POST", body: form });
};

beforeEach(async () => {
  await resetDb();
  uploads = [];
});

it("uploads the PDFs, then batch.json last, then starts one batch", async () => {
  const res = await send([pdf("INV-10300.pdf"), pdf("INV-10301.pdf")]);
  expect(res.status).toBe(200);
  const { id, name } = (await res.json()) as { id: number; name: string };
  expect(name).toMatch(/^upload-\d{8}-\d{6}-[0-9a-f]{4}$/);
  expect(uploads).toEqual([`${name}/INV-10300.pdf`, `${name}/INV-10301.pdf`, `${name}/batch.json`]);
  expect((await db.select().from(batches)).map((b) => b.id)).toEqual([id]);
  // fakeDeps({}) lists no PDFs, so the background run escalates; wait so it does not leak into the next test
  await vi.waitFor(async () => {
    expect((await db.select().from(batches).where(eq(batches.id, id)))[0].state).toBe("ESCALATED");
  });
});

it("cleans file names", async () => {
  const res = await send([pdf("../../my invoice.pdf")]);
  const { id, name } = (await res.json()) as { id: number; name: string };
  expect(uploads[0]).toBe(`${name}/my_invoice.pdf`);
  await vi.waitFor(async () => {
    expect((await db.select().from(batches).where(eq(batches.id, id)))[0].state).toBe("ESCALATED");
  });
});

it.each([
  ["no files", [], /at least one PDF/],
  ["a file that is not a PDF", [pdf("notes.pdf", "hello")], /not a PDF/],
  ["a name without .pdf", [pdf("scan.png")], /must end in \.pdf/],
  ["two files with the same name", [pdf("a.pdf"), pdf("a.pdf")], /same name/],
  ["more than 20 files", Array.from({ length: 21 }, (_, i) => pdf(`f${i}.pdf`)), /At most 20/],
  ["a file over 5 MB", [pdf("big.pdf", new Uint8Array(5 * 1024 * 1024 + 1).fill(37))], /larger than 5 MB/],
] as const)("refuses %s and uploads nothing", async (_, files, msg) => {
  const res = await send([...files]);
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: string }).error).toMatch(msg);
  expect(uploads).toEqual([]);
  expect(await db.$count(batches)).toBe(0);
});
