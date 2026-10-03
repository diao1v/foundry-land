import { expect, it } from "vitest";
import { parseMoney } from "../src/mapping/money";
import { applyMapping, fieldForLabel, labelSamples, Mapping, normalizeLabel } from "../src/mapping/mapping";
import v1 from "../mappings/v1.json";

const V1 = Mapping.parse(v1);
const f = (label: string, value: string, confidence = 0.95) => ({ label, value, confidence });

it("parses money", () => {
  expect(parseMoney("$1,234.50")).toBe(1234.5);
  expect(parseMoney(" 99 ")).toBe(99);
  expect(parseMoney("abc")).toBeNull();
  expect(parseMoney("")).toBeNull();
  expect(parseMoney(undefined)).toBeNull();
});

it("normalises labels from Document Intelligence", () => {
  expect(normalizeLabel("  Provider No.: ")).toBe("Provider No.");
  expect(normalizeLabel("Total (incl. GST):")).toBe("Total (incl. GST)");
  expect(normalizeLabel("Provider No .")).toBe("Provider No.");
});

it("maps exact labels and the Total prefix", () => {
  const m = applyMapping(V1, [f("Provider No.", "ED-30512"), f("Invoice No.:", "INV-1"), f("Total (excl. GST)", "$440.00", 0.8)]);
  expect(m.values).toMatchObject({ provider_no: "ED-30512", invoice_no: "INV-1", total: "$440.00" });
  expect(m.confidence.total).toBe(0.8);
  expect(m.unmappedLabels).toEqual([]);
});

it("reports labels no rule matches", () => {
  const m = applyMapping(V1, [f("Provider ID", "ED-30512"), f("GST", "$66.00")]);
  expect(m.values.provider_no).toBeUndefined();
  expect(m.unmappedLabels).toEqual(["Provider ID", "GST"]);
});

it("computes a derived field only when every input is present", () => {
  const mapping = Mapping.parse({
    ...v1,
    fields: [...v1.fields, { field: "gst", labels: ["GST"], match: "exact" }],
    derived: [{ field: "total", expression: "total + gst" }],
  });
  expect(applyMapping(mapping, [f("Total (excl. GST)", "$440.00"), f("GST", "$66.00")]).values.total).toBe("506.00");
  expect(applyMapping(mapping, [f("Total (incl. GST)", "$506.00")]).values.total).toBe("$506.00");
});

it("finds the field for a label", () => {
  expect(fieldForLabel(V1, "Total (incl. GST)")).toBe("total");
  expect(fieldForLabel(V1, "GST")).toBeUndefined();
});

it("collects up to 3 sample values per label", () => {
  const docs = [1, 2, 3, 4].map((n) => ({ documentId: n, lineItemsTotal: null, fields: [f("Patient:", `P${n}`)] }));
  expect(labelSamples(docs)).toEqual({ Patient: ["P1", "P2", "P3"] });
});
