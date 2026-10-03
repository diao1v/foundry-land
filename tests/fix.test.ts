import { expect, it } from "vitest";
import { applyFix, dryRun, FixRejected } from "../src/fix";
import { BATCHES } from "../src/demo/invoice-data";
import { GOOD_FIX, HISTORY, sourceDoc, V1 } from "./fixtures";

const demoDocs = () => BATCHES.demo().map((inv, i) => sourceDoc(inv, i + 1));

it("applies operations to a copy; the old mapping is unchanged", () => {
  const next = applyFix(V1, GOOD_FIX);
  expect(next.fields.find((f) => f.field === "provider_no")!.labels).toEqual(["Provider No.", "Provider ID"]);
  expect(next.fields.at(-1)).toEqual({ field: "gst", labels: ["GST"], match: "exact" });
  expect(next.derived).toEqual([{ field: "total", expression: "total + gst" }]);
  expect(V1.fields.find((f) => f.field === "provider_no")!.labels).toEqual(["Provider No."]);
  expect(V1.derived).toEqual([]);
});

it("the good fix passes the dry-run on a mixed v1 + v2 batch", () => {
  const { report } = dryRun(V1, GOOD_FIX, demoDocs(), HISTORY);
  expect(report).toMatchObject({ passed: true, severity: "OK" });
  expect(report.stats.avgTotal).toBe(993.6);
});

it("a fix without the GST derivation fails the dry-run (totals + fees)", () => {
  const { report } = dryRun(V1, GOOD_FIX.slice(0, 2), demoDocs(), HISTORY);
  expect(report.passed).toBe(false);
  expect(report.findings.map((f) => f.check).sort()).toEqual(["fee", "fee", "fee", "fee", "fee", "fee", "totals"]);
});

it.each([
  [{ op: "addLabelAlias", field: "nope", label: "X" }, /unknown field/],
  [{ op: "addField", field: "total", label: "X", match: "exact" }, /already exists/],
  [{ op: "addField", field: "Bad-Name", label: "X", match: "exact" }, /field name/],
  [{ op: "derivedField", field: "total", expression: "process.exit()" }, /Invalid expression/],
  [{ op: "derivedField", field: "total", expression: "total + tip" }, /unknown field.*tip/],
] as const)("rejects %j", (op, msg) => {
  expect(() => applyFix(V1, [op])).toThrow(FixRejected);
  expect(() => applyFix(V1, [op])).toThrow(msg);
});

it("the live batch (5 invoices) is caught by the fee check and fixed by the good fix", () => {
  const docs = BATCHES.live().map((inv, i) => sourceDoc(inv, i + 1));
  const before = dryRun(V1, [], docs, HISTORY).report;
  expect(before.findings.filter((f) => f.check === "fee").map((f) => f.message)).toEqual(
    expect.arrayContaining([expect.stringMatching(/"Specialist consultation" 180\.00 is -13\.0% vs history 207\.00/)]),
  );
  const after = dryRun(V1, GOOD_FIX, docs, HISTORY).report;
  expect(after).toMatchObject({ passed: true });
  expect(after.stats.avgTotal).toBe(993.6);
});
