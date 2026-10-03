import { expect, it } from "vitest";
import { maxSeverity, runChecks } from "../src/checks";
import { BATCHES } from "../src/demo/invoice-data";
import { checkDocs, HISTORY, V1 } from "./fixtures";

it("history: 60 invoices, 12 fees per procedure", () => {
  expect(HISTORY.count).toBe(60);
  expect(HISTORY.fees["knee arthroscopy"]).toHaveLength(12);
  expect(HISTORY.fees["specialist consultation"]).toHaveLength(60);
});

it("passes a normal v1 batch", () => {
  const r = runChecks(checkDocs(V1, BATCHES.normal()), HISTORY);
  expect(r).toMatchObject({ severity: "OK", passed: true, findings: [] });
  expect(r.stats.avgTotal).toBe(993.6);
});

it("stops the demo batch: rename is BREAKING, new labels INFO, every changed procedure −13.0% on fees", () => {
  const r = runChecks(checkDocs(V1, BATCHES.demo()), HISTORY);
  expect(r.passed).toBe(false);
  expect(r.severity).toBe("BREAKING");
  const by = (check: string, sev: string) => r.findings.filter((f) => f.check === check && f.severity === sev);
  expect(by("schema", "BREAKING")[0].message).toMatch(/provider_no.*8 of 10/);
  const fees = by("fee", "WARNING");
  expect(fees.map((f) => f.procedure).sort()).toEqual(["Ankle follow-up", "Carpal tunnel release", "Fracture review", "Knee arthroscopy", "Shoulder injection", "Specialist consultation"]);
  for (const f of fees) expect(f.message).toMatch(/-13\.0%/);
  expect(r.findings.some((f) => f.check === "totals")).toBe(false); // meaning change, same shape
});

it("the price batch: only the shoulder injection fee moved, +7.8%", () => {
  const r = runChecks(checkDocs(V1, BATCHES.price()), HISTORY);
  expect(r.findings).toEqual([
    expect.objectContaining({ check: "fee", severity: "WARNING", procedure: "Shoulder injection", fee: 396.75, historyFee: 368, docs: [2] }),
  ]);
  expect(r.findings[0].message).toBe('Fee for "Shoulder injection" 396.75 is 7.8% vs history 368.00 (12 invoices)');
});

it("an announced price makes the fee finding INFO, so the batch passes", () => {
  const r = runChecks(checkDocs(V1, BATCHES.price()), HISTORY, [{ procedure: "shoulder injection", newFee: 396.75 }]);
  expect(r.passed).toBe(true);
  expect(r.findings[0]).toMatchObject({ severity: "INFO", explained: true });
  expect(r.findings[0].message).toMatch(/announced by the clinic$/);
});

it("an announced price with a different fee explains nothing", () => {
  const r = runChecks(checkDocs(V1, BATCHES.price()), HISTORY, [{ procedure: "Shoulder injection", newFee: 390 }]);
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
