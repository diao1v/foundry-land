import { expect, it } from "vitest";
import { maxSeverity, runChecks } from "../src/checks";
import { BATCHES } from "../src/demo/invoice-data";
import { checkDocs, HISTORY, V1 } from "./fixtures";

it("history average is 993.60", () => {
  expect(HISTORY).toEqual({ avgTotal: 993.6, count: 60 });
});

it("passes a normal v1 batch", () => {
  const r = runChecks(checkDocs(V1, BATCHES.normal()), HISTORY);
  expect(r).toMatchObject({ severity: "OK", passed: true, findings: [] });
  expect(r.stats.avgTotal).toBe(993.6);
});

it("stops the demo batch: rename is BREAKING, new labels are INFO, totals drop is a value WARNING", () => {
  const r = runChecks(checkDocs(V1, BATCHES.demo()), HISTORY);
  expect(r.passed).toBe(false);
  expect(r.severity).toBe("BREAKING");
  const by = (check: string, sev: string) => r.findings.filter((f) => f.check === check && f.severity === sev);
  expect(by("schema", "BREAKING")[0].message).toMatch(/provider_no.*8 of 10/);
  expect(by("schema", "INFO").map((f) => f.labels?.[0]).sort()).toEqual(["GST", "Provider ID"]);
  expect(by("value", "WARNING")[0].message).toMatch(/-9\.8%/);
  // meaning change, same shape: the totals rule still passes
  expect(r.findings.some((f) => f.check === "totals")).toBe(false);
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

it("skips the value check with fewer than 10 history rows", () => {
  const r = runChecks(checkDocs(V1, BATCHES.demo()), { avgTotal: 993.6, count: 5 });
  expect(r.findings.some((f) => f.check === "value")).toBe(false);
});

it("takes the highest severity", () => {
  expect(maxSeverity("INFO", "BREAKING", "WARNING")).toBe("BREAKING");
  expect(maxSeverity()).toBe("OK");
});
