// Real Foundry calls. Run with `pnpm test:live` (needs .env and az login). Skipped by `pnpm test`.
import { beforeAll, describe, expect, it } from "vitest";
import { makeAgents } from "../../src/agents";
import { verifyCitations } from "../../src/agents/citations";
import { makeSearch } from "../../src/azure/search";
import { runChecks } from "../../src/checks";
import { loadConfig } from "../../src/config";
import { BATCHES } from "../../src/demo/invoice-data";
import { LETTER_ID, loadLocalNotices } from "../../src/demo/notices";
import { applyFix, dryRun } from "../../src/fix";
import { applyMapping, labelSamples, REQUIRED_FIELDS, type Mapping, type SourceDoc } from "../../src/mapping/mapping";
import { DRIFT, GOOD_FIX, HISTORY, INVESTIGATION, sourceDoc, V1 } from "../fixtures";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const demoDocs = () => BATCHES.demo().map((inv, i) => sourceDoc(inv, i + 1));
const driftInput = (mapping: Mapping, docs: SourceDoc[]) => ({
  checkReport: runChecks(
    docs.map((d) => ({ documentId: d.documentId, mapped: applyMapping(mapping, d.fields), lineItemsTotal: d.lineItemsTotal })),
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
    const out = await agents.investigate({ findings: DRIFT.findings, labelSamples: labelSamples(demoDocs()) });
    const { verified } = verifyCitations(out.citations, loadLocalNotices());
    expect(out.explanationFound).toBe(true);
    expect(verified.some((c) => c.docId === LETTER_ID)).toBe(true);
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
});
