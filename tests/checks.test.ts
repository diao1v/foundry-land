import { expect, it } from "vitest";
import { basisFees, maxSeverity, runChecks } from "../src/checks";
import { BATCHES, makeInvoice } from "../src/demo/invoice-data";
import { checkDocs, HISTORY, V1 } from "./fixtures";

it("history: 60 invoices, 20 fees per procedure, an inspection on every visit", () => {
  expect(HISTORY.count).toBe(60);
  expect(HISTORY.fees["extraction"]).toHaveLength(20);
  expect(HISTORY.fees["general inspection"]).toHaveLength(60);
});

it("passes a normal v1 batch", () => {
  const r = runChecks(checkDocs(V1, BATCHES.normal()), HISTORY);
  expect(r).toMatchObject({ severity: "OK", passed: true, findings: [] });
  expect(r.stats.avgTotal).toBe(218.5);
});

it("stops the demo batch: rename is BREAKING, new labels INFO, every changed procedure −13.0% on fees", () => {
  const r = runChecks(checkDocs(V1, BATCHES.demo()), HISTORY);
  expect(r.passed).toBe(false);
  expect(r.severity).toBe("BREAKING");
  const by = (check: string, sev: string) => r.findings.filter((f) => f.check === check && f.severity === sev);
  expect(by("schema", "BREAKING")[0].message).toMatch(/provider_no.*8 of 10/);
  const fees = by("fee", "WARNING");
  expect(fees.map((f) => f.procedure).sort()).toEqual(["Cleaning", "Extraction", "General inspection", "X-ray"]);
  for (const f of fees) expect(f.message).toMatch(/-13\.0%/);
  expect(r.findings.some((f) => f.check === "totals")).toBe(false); // meaning change, same shape
});

it("the price batch: only the extraction fee moved, +9.1%", () => {
  const r = runChecks(checkDocs(V1, BATCHES.price()), HISTORY);
  expect(r.findings).toEqual([
    expect.objectContaining({ check: "fee", severity: "WARNING", procedure: "Extraction", fee: 276, historyFee: 253, docs: [2, 5] }),
  ]);
  expect(r.findings[0].message).toBe('Fee for "Extraction" 276.00 is 9.1% vs history 253.00 (20 invoices)');
});

it("an announced price makes the fee finding INFO, so the batch passes", () => {
  const r = runChecks(checkDocs(V1, BATCHES.price()), HISTORY, [{ procedure: "extraction", newFee: 276 }]);
  expect(r.passed).toBe(true);
  expect(r.findings[0]).toMatchObject({ severity: "INFO", explained: true });
  expect(r.findings[0].message).toMatch(/announced by the clinic$/);
});

it("an announced price with a different fee explains nothing", () => {
  const r = runChecks(checkDocs(V1, BATCHES.price()), HISTORY, [{ procedure: "Extraction", newFee: 270 }]);
  expect(r.passed).toBe(false);
});

it("flags line items that do not add up", () => {
  const docs = checkDocs(V1, BATCHES.normal());
  docs[0].lineItemsTotal! += 10;
  const r = runChecks(docs, HISTORY);
  expect(r.findings).toEqual([expect.objectContaining({ check: "totals", severity: "WARNING", docs: [1] })]);
});

it("flags low confidence on required fields", () => {
  const docs = checkDocs(V1, BATCHES.normal());
  docs[2].mapped.confidence.total = 0.4;
  expect(runChecks(docs, HISTORY).findings[0]).toMatchObject({ check: "confidence", docs: [3] });
});

it("treats an unreadable total as a missing required field", () => {
  const docs = checkDocs(V1, BATCHES.normal());
  docs[1].mapped.values.total = "see attached";
  expect(runChecks(docs, HISTORY).findings[0]).toMatchObject({ check: "schema", severity: "BREAKING", docs: [2] });
});

it("skips the fee check with fewer than 3 history fees for a procedure", () => {
  const r = runChecks(checkDocs(V1, BATCHES.demo()), { ...HISTORY, fees: {} });
  expect(r.findings.some((f) => f.check === "fee")).toBe(false);
});

it("takes the highest severity", () => {
  expect(maxSeverity("INFO", "BREAKING", "WARNING")).toBe("BREAKING");
  expect(maxSeverity()).toBe("OK");
});

it("fees keep their printed basis when an invoice's line items do not add up (no fake fee changes)", () => {
  const docs = checkDocs(V1, BATCHES.normal());
  docs[0].lineItemsTotal! += 10;
  expect(basisFees(docs[0])).toEqual(docs[0].lineItems);
  expect(runChecks(docs, HISTORY).findings.map((f) => f.check)).toEqual(["totals"]);
});

it("an announced price matches the procedure as whole words ('an extraction' → Extraction), not part of a word", () => {
  expect(runChecks(checkDocs(V1, BATCHES.price()), HISTORY, [{ procedure: "an extraction", newFee: 276 }]).passed).toBe(true);
  expect(runChecks(checkDocs(V1, BATCHES.price()), HISTORY, [{ procedure: "extract", newFee: 276 }]).passed).toBe(false);
});

it("an announced price explains a fee finding only if every changed invoice has exactly that fee", () => {
  // three extractions: 276.00, 276.00 (announced) and 310.50 (not announced); the median is still 276.00
  const invs = [...BATCHES.price(), makeInvoice(407, "v1", "2026-11-02", { Extraction: 270 })];
  const r = runChecks(checkDocs(V1, invs), HISTORY, [{ procedure: "Extraction", newFee: 276 }]);
  expect(r.passed).toBe(false);
  expect(r.findings.find((f) => f.check === "fee")).toMatchObject({ severity: "WARNING" });
});

it("an invoice whose fee table is partly unreadable gives no fees (no fake fee change after a correct fix)", () => {
  const docs = checkDocs(V1, BATCHES.normal());
  Object.assign(docs[0], { lineItemsTotal: null }); // one fee cell unreadable: DI keeps the readable rows, total unknown
  docs[0].lineItems = docs[0].lineItems!.slice(0, 1);
  expect(basisFees(docs[0])).toEqual([]);
});
