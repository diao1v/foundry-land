import type { FixOp } from "../src/fix";
import { historyInvoices, type InvoiceData } from "../src/demo/invoice-data";
import { applyMapping, Mapping } from "../src/mapping/mapping";
import { round2 } from "../src/mapping/money";
import v1 from "../mappings/v1.json";

export const V1 = Mapping.parse(v1);

export const rawFields = (inv: InvoiceData) =>
  inv.fields.map(([label, value]) => ({ label, value, confidence: 0.95 }));

export const sourceDoc = (inv: InvoiceData, documentId: number) => ({
  documentId,
  fields: rawFields(inv),
  lineItemsTotal: inv.lineItemsTotal,
});

export const checkDocs = (mapping: Mapping, invs: InvoiceData[]) =>
  invs.map((inv, i) => ({
    documentId: i + 1,
    mapped: applyMapping(mapping, rawFields(inv)),
    lineItemsTotal: inv.lineItemsTotal,
  }));

const hist = historyInvoices();
export const HISTORY = { avgTotal: round2(hist.reduce((a, inv) => a + inv.total, 0) / hist.length), count: hist.length };

// The fix a good proposer should find for the demo batch
export const GOOD_FIX: FixOp[] = [
  { op: "addLabelAlias", field: "provider_no", label: "Provider ID" },
  { op: "addField", field: "gst", label: "GST", match: "exact" },
  { op: "derivedField", field: "total", expression: "total + gst" },
];
