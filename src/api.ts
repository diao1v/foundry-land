// JSON responses for the web app. Read-only; built from existing tables.
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { DriftReport, VerifiedInvestigation } from "./agents/schemas";
import type { CheckReport, Finding, Severity } from "./checks";
import type { Db } from "./db/client";
import { auditEvents, batches, documents, extractedFields, fixProposals, incidents, invoices, mappingVersions } from "./db/schema";
import { PROVIDER } from "./demo/invoice-data";
import { applyFix } from "./fix";
import { applyMapping, Mapping, ruleForLabel } from "./mapping/mapping";
import { parseMoney, round2 } from "./mapping/money";
import { currentMapping } from "./orchestrator";
import { cleanMarkers, describeOp, pct } from "./present";
import type { BatchState } from "./state";
import { batchSteps, type Step } from "./steps";

export type BatchRow = {
  id: number; name: string; state: BatchState; mappingVersion: number | null; updatedAt: string;
  invoices: number; avgTotal: number | null; changeVsHistory: number | null; steps: Step[];
};
export type BatchListResponse = {
  summary: { waitingForReview: number; invoicesLoaded: number; currentMapping: number; history: { avgTotal: number | null; count: number } };
  batches: BatchRow[];
};
export type Decision = {
  state: "todo" | "waiting" | "approved" | "rejected" | "not_needed" | "escalated";
  by?: string; at?: string; reason?: string;
  proposal?: { round: number; described: string[]; dryRunAvg: number | null };
  result?: { from: number; to: number; invoices: number; avgTotal: number | null; changeVsHistory: number | null };
};
export type BatchDetail = {
  batch: { id: number; name: string; state: BatchState; mappingVersion: number | null; updatedAt: string };
  provider: string;
  checkReport: CheckReport | null; codeSeverity: Severity | null; finalSeverity: Severity | null;
  drift: DriftReport | null; investigation: VerifiedInvestigation | null;
  proposals: { round: number; described: string[]; reasoning: string; passed: boolean; rejectedReason: string | null; dryRunFindings: Finding[] }[];
  documents: { id: number; name: string; flaggedBy: Finding["check"][] }[];
  events: { id: number; at: string; actor: string; action: string; details: unknown }[];
  steps: Step[];
  decision: Decision;
};
export type DocumentView = {
  doc: { id: number; name: string; batchId: number; batchName: string; unit: string; pageWidth: number; pageHeight: number };
  position: { index: number; total: number; prevId: number | null; nextId: number | null };
  mapping: { shown: "batch" | "proposed"; version: number; proposedAvailable: boolean };
  fields: { id: number; label: string; value: string; confidence: number; polygon: number[]; field: string | null; matchedBy: "exact" | "prefix" | null }[];
  derived: { field: string; expression: string; value: string | null }[];
  mappedCount: number;
  note: string | null;
};

const fileName = (blobPath: string) => blobPath.split("/").pop()!.replace(/\.pdf$/i, "");
const change = (avg: number | null, hist: number | null | undefined) =>
  avg == null || hist == null || hist === 0 ? null : (avg - hist) / hist;
const ESCALATION_WORDS: Record<string, (d: { agent?: string }) => string> = {
  "extraction.failed": () => "Extraction failed",
  "agent.unavailable": (d) => `Agent unavailable: ${d.agent ?? "unknown"}`,
  "fix.rounds_exhausted": () => "No passing fix in 3 rounds",
};

// Loaded invoices of each batch: count and average total
async function loadedStats(db: Db) {
  const rows = await db
    .select({ batchId: invoices.batchId, n: sql<number>`count(*)::int`, avg: sql<string | null>`avg(${invoices.total})` })
    .from(invoices)
    .where(isNotNull(invoices.batchId))
    .groupBy(invoices.batchId);
  return new Map(rows.map((r) => [r.batchId!, { n: r.n, avg: r.avg == null ? null : round2(Number(r.avg)) }]));
}

export async function listBatches(db: Db): Promise<BatchListResponse> {
  const [rows, incs, props, events, loaded, current, [hist]] = await Promise.all([
    db.select().from(batches).orderBy(desc(batches.id)),
    db.select().from(incidents),
    db.select({ incidentId: fixProposals.incidentId, round: fixProposals.round, passed: fixProposals.passed }).from(fixProposals),
    db.select({ batchId: auditEvents.batchId, actor: auditEvents.actor, action: auditEvents.action, details: auditEvents.details }).from(auditEvents),
    loadedStats(db),
    currentMapping(db),
    db.select({ avg: sql<string | null>`avg(${invoices.total})`, n: sql<number>`count(*)::int` }).from(invoices).where(isNull(invoices.batchId)),
  ]);
  const docCounts = new Map(
    (await db.select({ batchId: documents.batchId, n: sql<number>`count(*)::int` }).from(documents).groupBy(documents.batchId)).map((r) => [r.batchId, r.n]),
  );
  return {
    summary: {
      waitingForReview: rows.filter((b) => b.state === "AWAITING_REVIEW").length,
      invoicesLoaded: [...loaded.values()].reduce((a, s) => a + s.n, 0),
      currentMapping: current.version,
      history: { avgTotal: hist.avg == null ? null : round2(Number(hist.avg)), count: hist.n },
    },
    batches: rows.map((b) => {
      const inc = incs.find((i) => i.batchId === b.id);
      const report = inc?.checkReport ?? (events.find((e) => e.batchId === b.id && e.action === "checks.passed")?.details as CheckReport | undefined);
      const avgTotal = loaded.get(b.id)?.avg ?? report?.stats.avgTotal ?? null;
      return {
        id: b.id, name: b.name, state: b.state, mappingVersion: b.mappingVersion, updatedAt: b.updatedAt.toISOString(),
        invoices: docCounts.get(b.id) ?? 0,
        avgTotal,
        changeVsHistory: change(avgTotal, report?.stats.historyAvgTotal),
        steps: batchSteps({
          state: b.state, codeSeverity: inc?.codeSeverity ?? null, drift: inc?.drift ?? null, investigation: inc?.investigation ?? null,
          proposals: inc ? props.filter((p) => p.incidentId === inc.id) : [],
          events: events.filter((e) => e.batchId === b.id),
        }),
      };
    }),
  };
}

export async function batchDetail(db: Db, id: number): Promise<BatchDetail | null> {
  const [b] = await db.select().from(batches).where(eq(batches.id, id));
  if (!b) return null;
  const [inc] = await db.select().from(incidents).where(eq(incidents.batchId, id));
  const props = inc ? await db.select().from(fixProposals).where(eq(fixProposals.incidentId, inc.id)).orderBy(asc(fixProposals.round)) : [];
  const docs = await db.select().from(documents).where(eq(documents.batchId, id)).orderBy(asc(documents.id));
  const events = await db.select().from(auditEvents).where(eq(auditEvents.batchId, id)).orderBy(asc(auditEvents.id));
  const report = inc?.checkReport ?? (events.find((e) => e.action === "checks.passed")?.details as CheckReport | undefined) ?? null;
  const investigation = inc?.investigation ? { ...inc.investigation, explanation: cleanMarkers(inc.investigation.explanation) } : null;
  const passed = props.filter((p) => p.passed).at(-1);
  const event = (action: string) => events.filter((e) => e.action === action).at(-1);
  const who = (action: string) => event(action)?.actor.replace(/^human:/, "");

  let decision: Decision = { state: "todo" };
  if (b.state === "LOADED") decision = { state: "not_needed" };
  else if (b.state === "AWAITING_REVIEW" && passed)
    decision = { state: "waiting", proposal: { round: passed.round, described: passed.operations.map(describeOp), dryRunAvg: passed.dryRun?.stats.avgTotal ?? null } };
  else if (b.state === "RELOADED" && passed) {
    const stats = (await loadedStats(db)).get(id);
    decision = {
      state: "approved", by: who("review.approved"), at: event("review.approved")?.at.toISOString(),
      result: { from: passed.baseVersion, to: b.mappingVersion ?? passed.baseVersion + 1, invoices: stats?.n ?? 0, avgTotal: stats?.avg ?? null, changeVsHistory: change(stats?.avg ?? null, report?.stats.historyAvgTotal) },
    };
  } else if (b.state === "CLOSED")
    decision = { state: "rejected", by: who("review.rejected"), at: event("review.rejected")?.at.toISOString(), reason: (event("review.rejected")?.details as { reason?: string })?.reason };
  else if (b.state === "ESCALATED") {
    const e = events.filter((x) => x.action in ESCALATION_WORDS).at(-1);
    decision = { state: "escalated", reason: e ? ESCALATION_WORDS[e.action](e.details as { agent?: string }) : "Needs a person" };
  }

  return {
    batch: { id: b.id, name: b.name, state: b.state, mappingVersion: b.mappingVersion, updatedAt: b.updatedAt.toISOString() },
    provider: PROVIDER.name,
    checkReport: report, codeSeverity: inc?.codeSeverity ?? null, finalSeverity: inc?.finalSeverity ?? null,
    drift: inc?.drift ?? null, investigation,
    proposals: props.map((p) => ({
      round: p.round, described: p.operations.map(describeOp), reasoning: p.reasoning, passed: p.passed,
      rejectedReason: p.rejectedReason, dryRunFindings: p.dryRun?.findings ?? [],
    })),
    documents: docs.map((d) => ({
      id: d.id, name: fileName(d.blobPath),
      flaggedBy: [...new Set((report?.findings ?? []).filter((f) => f.docs?.includes(d.id)).map((f) => f.check))],
    })),
    events: events.map((e) => ({ id: e.id, at: e.at.toISOString(), actor: e.actor, action: e.action, details: e.details })),
    steps: batchSteps({ state: b.state, codeSeverity: inc?.codeSeverity ?? null, drift: inc?.drift ?? null, investigation, proposals: props, events }),
    decision,
  };
}

export async function documentView(db: Db, id: number, which: "batch" | "proposed"): Promise<DocumentView | null> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) return null;
  const [b] = await db.select().from(batches).where(eq(batches.id, doc.batchId));
  const version = b.mappingVersion ?? 1;
  const [m] = await db.select().from(mappingVersions).where(eq(mappingVersions.version, version));
  const batchMapping = Mapping.parse(m.mapping);
  const [inc] = await db.select().from(incidents).where(eq(incidents.batchId, b.id));
  const [passed] = inc
    ? await db.select().from(fixProposals).where(and(eq(fixProposals.incidentId, inc.id), eq(fixProposals.passed, true))).orderBy(desc(fixProposals.round)).limit(1)
    : [];
  const proposedAvailable = b.state === "AWAITING_REVIEW" && passed != null;
  const shown = which === "proposed" && proposedAvailable ? "proposed" : "batch";
  const mapping = shown === "proposed" ? applyFix(batchMapping, passed!.operations) : batchMapping;

  const siblings = await db.select({ id: documents.id }).from(documents).where(eq(documents.batchId, b.id)).orderBy(asc(documents.id));
  const at = siblings.findIndex((s) => s.id === id);
  const rows = await db.select().from(extractedFields).where(eq(extractedFields.documentId, id)).orderBy(asc(extractedFields.id));
  const fields = rows.map((f) => {
    const rule = ruleForLabel(mapping, f.label);
    return { id: f.id, label: f.label, value: f.value, confidence: f.confidence, polygon: f.polygon, field: rule?.field ?? null, matchedBy: rule?.match ?? null };
  });
  const values = applyMapping(mapping, rows).values;

  // "Why this matters": total read through a prefix rule (and not computed by a fix), on an invoice that also
  // changed shape, in a batch the value check flagged
  let note: string | null = null;
  const report = inc?.checkReport;
  const value = report?.findings.find((f) => f.check === "value");
  const changedShape = report?.findings.some((f) => f.check === "schema" && f.docs?.includes(id));
  const totalRow = fields.find((f) => f.field === "total");
  const totalComputed = mapping.derived.some((d) => d.field === "total");
  if (shown === "batch" && !totalComputed && value && changedShape && totalRow?.matchedBy === "prefix" && report!.stats.avgTotal != null && report!.stats.historyAvgTotal) {
    const rule = ruleForLabel(mapping, totalRow.label)!;
    const money = parseMoney(totalRow.value);
    note =
      `Mapping v${version} reads "total" from any label starting with "${rule.ruleLabel}", so ${money == null ? totalRow.value : `$${money.toFixed(2)}`} maps without a warning ` +
      `even though the label says "${totalRow.label}". Only the value check (${pct(change(report!.stats.avgTotal, report!.stats.historyAvgTotal)!)} vs history) catches it.`;
  }

  return {
    doc: { id: doc.id, name: fileName(doc.blobPath), batchId: b.id, batchName: b.name, unit: doc.unit, pageWidth: doc.pageWidth, pageHeight: doc.pageHeight },
    position: { index: at + 1, total: siblings.length, prevId: siblings[at - 1]?.id ?? null, nextId: siblings[at + 1]?.id ?? null },
    mapping: { shown, version: shown === "proposed" ? version + 1 : version, proposedAvailable },
    fields,
    derived: mapping.derived.map((d) => ({ field: d.field, expression: d.expression, value: /^\d/.test(values[d.field] ?? "") ? values[d.field] : null })),
    mappedCount: fields.filter((f) => f.field).length,
    note,
  };
}
