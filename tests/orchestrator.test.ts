import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import { auditEvents, batches, fixProposals, incidents, invoices, mappingVersions } from "../src/db/schema";
import { BATCHES } from "../src/demo/invoice-data";
import { seedHistory } from "../src/demo/seed";
import { approve, reject, startBatch } from "../src/orchestrator";
import { db, resetDb } from "./db";
import { DRIFT, GOOD_FIX, INVESTIGATION, runBatch as run } from "./fixtures";
const stateOf = async (id: number) => (await db.select().from(batches).where(eq(batches.id, id)))[0].state;
const actions = async () => (await db.select().from(auditEvents)).map((e) => e.action);

beforeEach(async () => {
  await resetDb();
  await seedHistory(db);
});

it("loads a normal batch", async () => {
  const { id } = await run("normal", BATCHES.normal());
  expect(await stateOf(id)).toBe("LOADED");
  expect(await db.$count(invoices, eq(invoices.batchId, id))).toBe(5);
});

it("ignores a duplicate event for the same batch", async () => {
  expect(await startBatch(db, "dup")).toBe(1);
  expect(await startBatch(db, "dup")).toBeNull();
  expect(await db.$count(batches)).toBe(1);
});

it("stops the demo batch, dry-runs a fix and waits for review", async () => {
  let notified = 0;
  const { id } = await run("demo", BATCHES.demo(), { notifyReview: async () => { notified++; } });
  expect(await stateOf(id)).toBe("AWAITING_REVIEW");
  expect(notified).toBe(1);
  expect(await db.select().from(fixProposals)).toEqual([expect.objectContaining({ round: 1, passed: true })]);
  expect(await db.$count(invoices, eq(invoices.batchId, id))).toBe(0);
  expect(await actions()).toEqual([
    "batch.received", "batch.extracted", "batch.mapped", "checks.failed", "incident.opened",
    "analysis.completed", "investigation.completed", "proposal.created", "dry_run.passed", "review.requested",
  ]);
});

it("approve creates mapping v2 and reloads with GST-inclusive totals", async () => {
  const { id, d } = await run("demo", BATCHES.demo());
  await approve(d, id, "yiwei");
  expect(await stateOf(id)).toBe("RELOADED");
  expect((await db.select().from(mappingVersions)).map((v) => v.version)).toEqual([1, 2]);
  const rows = await db.select().from(invoices).where(eq(invoices.batchId, id));
  expect(rows).toHaveLength(10);
  const v2 = rows.find((r) => r.invoiceNo === "INV-10202")!;
  expect(v2).toMatchObject({ providerNo: "EO-20417", total: 506, gst: 66, mappingVersion: 2 });
});

it("refuses a second approval", async () => {
  const { id, d } = await run("demo", BATCHES.demo());
  await approve(d, id, "yiwei");
  await expect(approve(d, id, "yiwei")).rejects.toThrow(/not AWAITING_REVIEW/);
  expect(await db.$count(mappingVersions)).toBe(2);
});

it("refuses approval when the mapping changed after the dry-run", async () => {
  const { id, d } = await run("demo", BATCHES.demo());
  const [v1] = await db.select().from(mappingVersions);
  await db.insert(mappingVersions).values({ version: 2, mapping: v1.mapping, createdBy: "test", reason: "other batch" });
  await expect(approve(d, id, "yiwei")).rejects.toThrow(/Mapping changed/);
});

it("reject closes the batch", async () => {
  const { id, d } = await run("demo", BATCHES.demo());
  await reject(d, id, "yiwei", "wrong provider");
  expect(await stateOf(id)).toBe("CLOSED");
});

it("feeds dry-run failures into the next round", async () => {
  const seen: number[] = [];
  const { id } = await run("demo", BATCHES.demo(), {
    proposeFix: async (input) => {
      seen.push((input as { previousRounds: unknown[] }).previousRounds.length);
      return { operations: seen.length === 1 ? GOOD_FIX.slice(0, 2) : GOOD_FIX, reasoning: "x" };
    },
  });
  expect(await stateOf(id)).toBe("AWAITING_REVIEW");
  expect(seen).toEqual([0, 1]);
});

it("rejects a disallowed operation before the dry-run", async () => {
  let n = 0;
  const { id } = await run("demo", BATCHES.demo(), {
    proposeFix: async () => ({
      operations: n++ === 0 ? [{ op: "derivedField", field: "total", expression: "process.exit()" }] : GOOD_FIX,
      reasoning: "x",
    }),
  });
  expect(await stateOf(id)).toBe("AWAITING_REVIEW");
  const [first] = await db.select().from(fixProposals).where(eq(fixProposals.round, 1));
  expect(first.rejectedReason).toMatch(/Invalid expression/);
  expect(first.dryRun).toBeNull();
});

it("escalates after 3 failed rounds", async () => {
  const { id } = await run("demo", BATCHES.demo(), {
    proposeFix: async () => ({ operations: GOOD_FIX.slice(0, 1), reasoning: "x" }),
  });
  expect(await stateOf(id)).toBe("ESCALATED");
  expect(await db.$count(fixProposals)).toBe(3);
  expect(await actions()).toContain("fix.rounds_exhausted");
});

it("escalates as 'agent unavailable' when an agent fails", async () => {
  const { id } = await run("demo", BATCHES.demo(), { drift: async () => { throw new Error("503"); } });
  expect(await stateOf(id)).toBe("ESCALATED");
  expect(await actions()).toContain("agent.unavailable");
});

it("never lets the agent lower the severity", async () => {
  await run("demo", BATCHES.demo(), { drift: async () => ({ ...DRIFT, severity: "INFO" }) });
  expect((await db.select().from(incidents))[0]).toMatchObject({ codeSeverity: "BREAKING", finalSeverity: "BREAKING" });
});

it("drops quotes that are not in any notice", async () => {
  await run("demo", BATCHES.demo(), {
    investigate: async () => ({
      ...INVESTIGATION,
      citations: [...INVESTIGATION.citations, { docId: "x", quote: "Totals now include a 5% surcharge." }],
    }),
  });
  const [inc] = await db.select().from(incidents);
  expect(inc.investigation!.verifiedCitations).toHaveLength(1);
  expect(inc.investigation!.rejectedCitations).toHaveLength(1);
  expect(await actions()).toContain("citation.rejected");
});

it("an explanation with no verified quote counts as not found", async () => {
  await run("demo", BATCHES.demo(), {
    investigate: async () => ({ ...INVESTIGATION, citations: [{ docId: "x", quote: "Made up sentence about totals." }] }),
  });
  expect((await db.select().from(incidents))[0].investigation!.explanationFound).toBe(false);
});

it("escalates when extraction fails", async () => {
  const { id } = await run("bad", BATCHES.normal(), { extract: async () => { throw new Error("DI down"); } });
  expect(await stateOf(id)).toBe("ESCALATED");
  expect(await actions()).toContain("extraction.failed");
}, 10_000);
