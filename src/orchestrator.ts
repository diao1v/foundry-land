import { desc, eq, inArray, sql } from "drizzle-orm";
import type { Notice } from "./agents/citations";
import { verifyCitations } from "./agents/citations";
import type { DriftReport, FixProposal, Investigation, VerifiedInvestigation } from "./agents/schemas";
import { audit, transition } from "./audit";
import type { ExtractedDoc } from "./azure/docint";
import { maxSeverity, runChecks, type CheckDoc, type CheckReport, type History } from "./checks";
import type { Db } from "./db/client";
import { batches, documents, extractedFields, fixProposals, incidents, invoices, mappingVersions } from "./db/schema";
import { applyFix, dryRun, FixRejected } from "./fix";
import { applyMapping, labelSamples, Mapping, REQUIRED_FIELDS, type SourceDoc } from "./mapping/mapping";
import { parseMoney, round2 } from "./mapping/money";
import { withRetry } from "./retry";
import { tracer } from "./telemetry";

export type Deps = {
  db: Db;
  listPdfs(batchName: string): Promise<string[]>;
  extract(blobPath: string): Promise<ExtractedDoc>;
  drift(input: unknown): Promise<DriftReport>;
  investigate(input: unknown): Promise<Investigation>;
  proposeFix(input: unknown): Promise<FixProposal>;
  notices(): Promise<Notice[]>;
  notifyReview(batchId: number): Promise<void>;
};

export const MAX_ROUNDS = 3;
const SYSTEM = "system";
export class ReviewError extends Error {}

export async function startBatch(db: Db, name: string): Promise<number | null> {
  const [row] = await db.insert(batches).values({ name }).onConflictDoNothing().returning({ id: batches.id });
  if (!row) return null; // duplicate event
  await audit(db, { batchId: row.id, actor: SYSTEM, action: "batch.received", details: { name } });
  return row.id;
}

export async function currentMapping(db: Db) {
  const [row] = await db.select().from(mappingVersions).orderBy(desc(mappingVersions.version)).limit(1);
  return { version: row.version, mapping: Mapping.parse(row.mapping) };
}

async function loadDocs(db: Db, batchId: number): Promise<SourceDoc[]> {
  const docs = await db.select().from(documents).where(eq(documents.batchId, batchId)).orderBy(documents.id);
  if (!docs.length) return [];
  const fields = await db.select().from(extractedFields).where(inArray(extractedFields.documentId, docs.map((d) => d.id)));
  return docs.map((d) => ({
    documentId: d.id,
    lineItemsTotal: d.lineItemsTotal,
    fields: fields.filter((f) => f.documentId === d.id),
  }));
}

async function history(db: Db, batchId: number): Promise<History> {
  const [r] = await db
    .select({ avg: sql<string | null>`avg(${invoices.total})`, count: sql<number>`count(*)::int` })
    .from(invoices)
    .where(sql`${invoices.batchId} is distinct from ${batchId}`);
  return { avgTotal: r.avg == null ? null : round2(Number(r.avg)), count: r.count };
}

const mapDocs = (mapping: Mapping, docs: SourceDoc[]): CheckDoc[] =>
  docs.map((d) => ({ documentId: d.documentId, mapped: applyMapping(mapping, d.fields), lineItemsTotal: d.lineItemsTotal }));

// Upsert on (provider, invoice number): loading twice is safe.
async function loadInvoices(db: Db, batchId: number, mappingVersion: number, docs: CheckDoc[]) {
  for (const { mapped } of docs) {
    const v = mapped.values;
    const row = {
      providerNo: v.provider_no,
      invoiceNo: v.invoice_no,
      invoiceDate: v.invoice_date ?? null,
      serviceDate: v.service_date ?? null,
      patientName: v.patient_name ?? null,
      memberNo: v.member_no ?? null,
      total: parseMoney(v.total)!, // checks passed → readable
      gst: parseMoney(v.gst),
      batchId,
      mappingVersion,
    };
    await db.insert(invoices).values(row).onConflictDoUpdate({ target: [invoices.providerNo, invoices.invoiceNo], set: row });
  }
}

export async function processBatch(deps: Deps, batchId: number) {
  const { db } = deps;
  await tracer.startActiveSpan("batch.process", async (span) => {
    span.setAttribute("batch.id", batchId);
    try {
      const [batch] = await db.select().from(batches).where(eq(batches.id, batchId));
      let count = 0;
      try {
        const paths = await deps.listPdfs(batch.name);
        if (!paths.length) throw new Error("no PDFs in the batch folder");
        for (const blobPath of paths) {
          const doc = await withRetry(() => deps.extract(blobPath));
          const [d] = await db
            .insert(documents)
            .values({ batchId, blobPath, pageWidth: doc.pageWidth, pageHeight: doc.pageHeight, unit: doc.unit, lineItemsTotal: doc.lineItemsTotal })
            .returning({ id: documents.id });
          if (doc.fields.length) await db.insert(extractedFields).values(doc.fields.map((f) => ({ ...f, documentId: d.id })));
          count++;
        }
      } catch (e) {
        await transition(db, batchId, "ESCALATED", SYSTEM, "extraction.failed", { error: String(e) });
        return;
      }
      await transition(db, batchId, "EXTRACTED", SYSTEM, "batch.extracted", { documents: count });

      const current = await currentMapping(db);
      await db.update(batches).set({ mappingVersion: current.version }).where(eq(batches.id, batchId));
      const docs = await loadDocs(db, batchId);
      const mapped = mapDocs(current.mapping, docs);
      await transition(db, batchId, "MAPPED", SYSTEM, "batch.mapped", { mappingVersion: current.version });

      const report = runChecks(mapped, await history(db, batchId));
      await transition(db, batchId, "CHECKED", SYSTEM, report.passed ? "checks.passed" : "checks.failed", report);
      if (report.passed) {
        await loadInvoices(db, batchId, current.version, mapped);
        await transition(db, batchId, "LOADED", SYSTEM, "batch.loaded", { invoices: mapped.length });
        return;
      }
      await runIncident(deps, batchId, current, docs, report);
    } finally {
      span.end();
    }
  });
}

async function runIncident(
  deps: Deps,
  batchId: number,
  current: { version: number; mapping: Mapping },
  docs: SourceDoc[],
  report: CheckReport,
) {
  const { db } = deps;
  const [incident] = await db
    .insert(incidents)
    .values({ batchId, checkReport: report, codeSeverity: report.severity })
    .returning({ id: incidents.id });
  await transition(db, batchId, "INCIDENT_OPEN", SYSTEM, "incident.opened", { incidentId: incident.id, severity: report.severity });
  const samples = labelSamples(docs);
  const escalate = (agent: string, e: unknown) =>
    transition(db, batchId, "ESCALATED", SYSTEM, "agent.unavailable", { agent, error: String(e) });

  // 1. Drift analyst — severity can only go up
  let drift: DriftReport;
  try {
    drift = await deps.drift({ checkReport: report, labelSamples: samples, requiredFields: REQUIRED_FIELDS, mapping: current.mapping });
  } catch (e) {
    return escalate("drift-analyst", e);
  }
  const finalSeverity = maxSeverity(report.severity, drift.severity);
  await db.update(incidents).set({ drift, finalSeverity }).where(eq(incidents.id, incident.id));
  await transition(db, batchId, "ANALYSED", "agent:drift-analyst", "analysis.completed", {
    codeSeverity: report.severity,
    agentSeverity: drift.severity,
    finalSeverity,
  });

  // 2. Investigator — every quote is checked against the notices
  let investigation: VerifiedInvestigation;
  try {
    const raw = await deps.investigate({ findings: drift.findings, labelSamples: samples });
    const { verified, rejected } = verifyCitations(raw.citations, await deps.notices());
    investigation = {
      ...raw,
      explanationFound: raw.explanationFound && verified.length > 0,
      verifiedCitations: verified,
      rejectedCitations: rejected,
    };
    for (const c of rejected) await audit(db, { batchId, actor: SYSTEM, action: "citation.rejected", details: c });
  } catch (e) {
    return escalate("investigator", e);
  }
  await db.update(incidents).set({ investigation }).where(eq(incidents.id, incident.id));
  await transition(db, batchId, "INVESTIGATED", "agent:investigator", "investigation.completed", {
    explanationFound: investigation.explanationFound,
    verifiedCitations: investigation.verifiedCitations.length,
  });

  // 3. Fix proposer ⇄ dry-run, at most MAX_ROUNDS
  const hist = await history(db, batchId);
  const previousRounds: unknown[] = [];
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    let proposal: FixProposal;
    try {
      proposal = await deps.proposeFix({
        mapping: current.mapping,
        findings: drift.findings,
        investigation: {
          explanationFound: investigation.explanationFound,
          explanation: investigation.explanation,
          citations: investigation.verifiedCitations,
        },
        labelSamples: samples,
        previousRounds,
      });
    } catch (e) {
      return escalate("fix-proposer", e);
    }
    const [p] = await db
      .insert(fixProposals)
      .values({ incidentId: incident.id, round, operations: proposal.operations, reasoning: proposal.reasoning, baseVersion: current.version })
      .returning({ id: fixProposals.id });
    await transition(db, batchId, "PROPOSED", "agent:fix-proposer", "proposal.created", { round, operations: proposal.operations });

    let dry: CheckReport;
    try {
      dry = dryRun(current.mapping, proposal.operations, docs, hist).report;
    } catch (e) {
      if (!(e instanceof FixRejected)) throw e;
      await db.update(fixProposals).set({ rejectedReason: e.message }).where(eq(fixProposals.id, p.id));
      await audit(db, { batchId, actor: SYSTEM, action: "proposal.rejected", details: { round, reason: e.message } });
      previousRounds.push({ round, operations: proposal.operations, rejectedReason: e.message });
      continue;
    }
    await db.update(fixProposals).set({ dryRun: dry, passed: dry.passed }).where(eq(fixProposals.id, p.id));
    await transition(db, batchId, "DRY_RUN", SYSTEM, dry.passed ? "dry_run.passed" : "dry_run.failed", {
      round,
      severity: dry.severity,
      findings: dry.findings,
    });
    if (dry.passed) {
      await transition(db, batchId, "AWAITING_REVIEW", SYSTEM, "review.requested", { round });
      await deps
        .notifyReview(batchId)
        .catch((e) => audit(db, { batchId, actor: SYSTEM, action: "notify.failed", details: { error: String(e) } }));
      return;
    }
    previousRounds.push({ round, operations: proposal.operations, dryRunFindings: dry.findings });
  }
  await transition(db, batchId, "ESCALATED", SYSTEM, "fix.rounds_exhausted", { rounds: MAX_ROUNDS });
}

export async function approve(deps: Deps, batchId: number, reviewer: string) {
  const { db } = deps;
  const actor = `human:${reviewer}`;
  const [b] = await db.select().from(batches).where(eq(batches.id, batchId));
  if (b?.state !== "AWAITING_REVIEW") throw new ReviewError(`Batch is ${b?.state ?? "missing"}, not AWAITING_REVIEW`);
  const [p] = await db
    .select({ id: fixProposals.id, round: fixProposals.round, operations: fixProposals.operations, baseVersion: fixProposals.baseVersion })
    .from(fixProposals)
    .innerJoin(incidents, eq(fixProposals.incidentId, incidents.id))
    .where(sql`${incidents.batchId} = ${batchId} and ${fixProposals.passed}`)
    .orderBy(desc(fixProposals.round))
    .limit(1);
  const current = await currentMapping(db);
  if (current.version !== p.baseVersion) {
    throw new ReviewError(`Mapping changed (v${p.baseVersion} → v${current.version}) since the dry-run. Re-run the batch.`);
  }
  const next = applyFix(current.mapping, p.operations);
  const version = current.version + 1;
  // Primary key on version: a double click cannot create two versions.
  await db.insert(mappingVersions).values({ version, mapping: next, createdBy: actor, reason: `batch ${b.name}, round ${p.round}` });
  await audit(db, { batchId, actor, action: "review.approved", details: { proposalId: p.id, mappingVersion: version } });

  const mapped = mapDocs(next, await loadDocs(db, batchId));
  await loadInvoices(db, batchId, version, mapped);
  await db.update(batches).set({ mappingVersion: version }).where(eq(batches.id, batchId));
  await transition(db, batchId, "RELOADED", actor, "batch.reloaded", { mappingVersion: version, invoices: mapped.length });
}

export async function reject(deps: Deps, batchId: number, reviewer: string, reason: string) {
  await transition(deps.db, batchId, "CLOSED", `human:${reviewer}`, "review.rejected", { reason });
}
