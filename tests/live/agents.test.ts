// Real Foundry calls. Run with `pnpm test:live` (needs .env and az login). Skipped by `pnpm test`.
import { beforeAll, describe, expect, it } from "vitest";
import { makeAgents } from "../../src/agents";
import { verifyCitations, verifyPriceChanges } from "../../src/agents/citations";
import { makeSearch } from "../../src/azure/search";
import { runChecks } from "../../src/checks";
import { loadConfig } from "../../src/config";
import { BATCHES } from "../../src/demo/invoice-data";
import { LETTER_ID, loadLocalNotices, loadProjectDocs } from "../../src/demo/notices";
import { verifySources } from "../../src/chat";
import { applyFix, dryRun } from "../../src/fix";
import { applyMapping, labelSamples, REQUIRED_FIELDS, type Mapping, type SourceDoc } from "../../src/mapping/mapping";
import { DRIFT, GOOD_FIX, HISTORY, INVESTIGATION, sourceDoc, V1 } from "../fixtures";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const demoDocs = () => BATCHES.demo().map((inv, i) => sourceDoc(inv, i + 1));
const driftInput = (mapping: Mapping, docs: SourceDoc[]) => ({
  checkReport: runChecks(
    docs.map((d) => ({ documentId: d.documentId, mapped: applyMapping(mapping, d.fields), lineItemsTotal: d.lineItemsTotal, lineItems: d.lineItems })),
    HISTORY,
  ),
  labelSamples: labelSamples(docs),
  requiredFields: REQUIRED_FIELDS,
  mapping,
});

describe.skipIf(!process.env.LIVE)("live agents", () => {
  let agents: ReturnType<typeof makeAgents>;
  let search: ReturnType<typeof makeSearch>;

  beforeAll(async () => {
    try { process.loadEnvFile(".env"); } catch { /* env already set */ }
    const cfg = loadConfig();
    agents = makeAgents(cfg);
    search = makeSearch(cfg);
    await search.createIndex();
    await search.upsert(loadLocalNotices());
    await sleep(2000);
  });

  it("drift: names the rename and the GST meaning change", async () => {
    const out = await agents.drift(driftInput(V1, demoDocs()));
    expect(out.findings.some((f) => f.kind === "rename" && f.labels.includes("Provider ID"))).toBe(true);
    expect(out.findings.some((f) => f.kind === "meaning_change" && f.field === "total")).toBe(true);
  }, 120_000);

  it("drift: only a rename when GST is already handled", async () => {
    const out = await agents.drift(driftInput(applyFix(V1, GOOD_FIX.slice(1)), demoDocs()));
    expect(out.findings.some((f) => f.kind === "rename")).toBe(true);
    expect(out.findings.some((f) => f.kind === "meaning_change")).toBe(false);
  }, 120_000);

  it("drift: a clean batch has no meaning change and is not BREAKING", async () => {
    const out = await agents.drift(driftInput(V1, BATCHES.normal().map(sourceDoc)));
    expect(out.findings.some((f) => f.kind === "meaning_change")).toBe(false);
    expect(out.severity).not.toBe("BREAKING");
  }, 120_000);

  it("investigator: finds and quotes the provider letter", async () => {
    const out = await agents.investigate({ findings: DRIFT.findings, labelSamples: labelSamples(demoDocs()), invoiceDates: { earliest: "2026-09-29", latest: "2026-10-08" } });
    const { verified } = verifyCitations(out.citations, loadLocalNotices());
    expect(out.explanationFound).toBe(true);
    expect(verified.some((c) => c.docId === LETTER_ID)).toBe(true);
    // seen live: the November price notice was cited for the October GST batch, to say it was ruled out
    expect(verified.filter((c) => c.docId === "price-update-example-dental")).toEqual([]);
  }, 120_000);

  it("investigator: no letter → not explained (and the injected note is ignored)", async () => {
    await search.remove([LETTER_ID]);
    await sleep(2000);
    try {
      const out = await agents.investigate({ findings: DRIFT.findings, labelSamples: labelSamples(demoDocs()) });
      const { verified } = verifyCitations(out.citations, loadLocalNotices());
      expect(out.explanationFound && verified.length > 0).toBe(false);
    } finally {
      await search.upsert(loadLocalNotices());
    }
  }, 120_000);

  it("investigator: finds and verifies the extraction price notice for a price-rise batch", async () => {
    const out = await agents.investigate({
      findings: [{ kind: "price_change", field: null, labels: [], evidence: 'Fee for "Extraction" 276.00 is 9.1% vs history 253.00 (20 invoices)' }],
      labelSamples: labelSamples(BATCHES.price().map(sourceDoc)),
      invoiceDates: { earliest: "2026-11-02", latest: "2026-11-02" },
    });
    const { verified } = verifyPriceChanges(out.priceChanges, loadLocalNotices());
    expect(verified.some((p) => / extraction /.test(` ${p.procedure.toLowerCase()} `) && p.newFee === 276 && p.effectiveFrom === "2026-11-01")).toBe(true);
  }, 120_000);

  it("investigator: the price notice does not explain the GST batch", async () => {
    const docs = demoDocs();
    const out = await agents.investigate({ findings: DRIFT.findings, labelSamples: labelSamples(docs), invoiceDates: { earliest: "2026-09-29", latest: "2026-10-08" } });
    // the notice starts 1 November, after every invoice: the agent should not report it at all
    expect(out.priceChanges.filter((p) => /extraction/i.test(p.procedure))).toEqual([]);
    const explained = verifyPriceChanges(out.priceChanges, loadLocalNotices()).verified.map(({ procedure, newFee }) => ({ procedure, newFee }));
    const mapped = docs.map((d) => ({ documentId: d.documentId, mapped: applyMapping(V1, d.fields), lineItemsTotal: d.lineItemsTotal, lineItems: d.lineItems }));
    expect(runChecks(mapped, HISTORY, explained).passed).toBe(false);
  }, 120_000);

  it("fix-proposer: reaches a fix that passes the dry-run within 3 rounds", async () => {
    const docs = demoDocs();
    const previousRounds: unknown[] = [];
    for (let round = 1; round <= 3; round++) {
      const p = await agents.proposeFix({ mapping: V1, findings: DRIFT.findings, investigation: INVESTIGATION, labelSamples: labelSamples(docs), previousRounds });
      try {
        const { report } = dryRun(V1, p.operations, docs, HISTORY);
        if (report.passed) return;
        previousRounds.push({ round, operations: p.operations, dryRunFindings: report.findings });
      } catch (e) {
        previousRounds.push({ round, operations: p.operations, rejectedReason: (e as Error).message });
      }
    }
    throw new Error(`no passing fix in 3 rounds: ${JSON.stringify(previousRounds)}`);
  }, 360_000);

  it("project guide: answers 'what happens when an agent fails?' with a verified source from the agents doc", async () => {
    const r = await agents.guide({ question: "What happens when an agent fails?", history: [] });
    const { verified } = verifySources(r.sources, loadProjectDocs());
    expect(verified.some((s) => s.docId === "agents-and-guardrails")).toBe(true);
  }, 120_000);

  it("project guide: no verified sources for an off-topic question", async () => {
    const r = await agents.guide({ question: "What is the capital of France?", history: [] });
    expect(verifySources(r.sources, loadProjectDocs()).verified).toEqual([]);
  }, 120_000);
});
