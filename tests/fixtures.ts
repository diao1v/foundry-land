import type { DriftReport, Investigation } from "../src/agents/schemas";
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

export const DRIFT: DriftReport = {
  findings: [
    { kind: "rename", field: "provider_no", labels: ["Provider No.", "Provider ID"], evidence: "Provider No. missing where Provider ID appears, same values" },
    { kind: "new_field", field: "gst", labels: ["GST"], evidence: "New GST line" },
    { kind: "meaning_change", field: "total", labels: ["Total (incl. GST)", "Total (excl. GST)"], evidence: "Label now says excl. GST; average total down 9.8%" },
  ],
  severity: "BREAKING",
  impact: "Provider number would be empty and totals understated by GST.",
};

export const INVESTIGATION: Investigation = {
  explanationFound: true,
  explanation: "The provider's letter says totals exclude GST and Provider No. is renamed Provider ID from 1 October 2026.",
  citations: [{ docId: "Example Orthopaedics Ltd — changes to our invoices", quote: "First, invoice totals will exclude GST." }],
  unexplained: [],
};
