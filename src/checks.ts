import { REQUIRED_FIELDS, type MappedDoc } from "./mapping/mapping";
import { parseMoney, round2 } from "./mapping/money";

export type Severity = "OK" | "INFO" | "WARNING" | "BREAKING";
const RANK: Record<Severity, number> = { OK: 0, INFO: 1, WARNING: 2, BREAKING: 3 };
export const maxSeverity = (...s: Severity[]): Severity =>
  s.reduce<Severity>((a, b) => (RANK[b] > RANK[a] ? b : a), "OK");

export type Finding = {
  check: "schema" | "confidence" | "totals" | "value";
  severity: Severity;
  message: string;
  docs?: number[];
  labels?: string[];
  field?: string; // schema: the required field that is missing
};
export type CheckDoc = { documentId: number; mapped: MappedDoc; lineItemsTotal: number | null };
export type History = { avgTotal: number | null; count: number };
export type CheckReport = {
  severity: Severity;
  passed: boolean;
  findings: Finding[];
  stats: { invoices: number; avgTotal: number | null; historyAvgTotal: number | null; historyCount: number };
};

// Calibration knobs: check them against real Document Intelligence output on Day 1.
export const CONFIDENCE_MIN = 0.7;
export const VALUE_DRIFT_MAX = 0.05;
const MIN_HISTORY = 10;

const present = (d: CheckDoc, field: string) =>
  field === "total" ? parseMoney(d.mapped.values.total) != null : Boolean(d.mapped.values[field]);

export function runChecks(docs: CheckDoc[], history: History): CheckReport {
  const findings: Finding[] = [];
  const ids = (list: CheckDoc[]) => list.map((d) => d.documentId);

  // Schema: required fields
  for (const field of REQUIRED_FIELDS) {
    const missing = docs.filter((d) => !present(d, field));
    if (missing.length) {
      findings.push({
        check: "schema",
        severity: "BREAKING",
        message: `Required field "${field}" is missing or unreadable in ${missing.length} of ${docs.length} invoices`,
        docs: ids(missing),
        field,
      });
    }
  }

  // Schema: labels no mapping rule knows
  for (const label of [...new Set(docs.flatMap((d) => d.mapped.unmappedLabels))]) {
    const withLabel = docs.filter((d) => d.mapped.unmappedLabels.includes(label));
    findings.push({
      check: "schema",
      severity: "INFO",
      message: `New label "${label}" in ${withLabel.length} invoices`,
      docs: ids(withLabel),
      labels: [label],
    });
  }

  // Extraction confidence on required fields
  const low = docs.filter((d) => REQUIRED_FIELDS.some((f) => (d.mapped.confidence[f] ?? 1) < CONFIDENCE_MIN));
  if (low.length) {
    findings.push({
      check: "confidence",
      severity: "WARNING",
      message: `Low extraction confidence (below ${CONFIDENCE_MIN}) on required fields in ${low.length} invoices`,
      docs: ids(low),
    });
  }

  // Totals rule: line items = total − GST (GST = 0 when not mapped)
  const unbalanced = docs.filter((d) => {
    const total = parseMoney(d.mapped.values.total);
    if (total == null || d.lineItemsTotal == null) return false;
    const gst = parseMoney(d.mapped.values.gst) ?? 0;
    return Math.abs(d.lineItemsTotal - (total - gst)) > 0.01;
  });
  if (unbalanced.length) {
    findings.push({
      check: "totals",
      severity: "WARNING",
      message: `Line items do not add up to total minus GST in ${unbalanced.length} invoices`,
      docs: ids(unbalanced),
    });
  }

  // Value check: batch average total vs history
  const totals = docs.map((d) => parseMoney(d.mapped.values.total)).filter((t): t is number => t != null);
  const avgTotal = totals.length ? round2(totals.reduce((a, b) => a + b, 0) / totals.length) : null;
  if (avgTotal != null && history.avgTotal != null && history.count >= MIN_HISTORY) {
    const change = (avgTotal - history.avgTotal) / history.avgTotal;
    if (Math.abs(change) > VALUE_DRIFT_MAX) {
      findings.push({
        check: "value",
        severity: "WARNING",
        message: `Average total ${avgTotal.toFixed(2)} is ${(change * 100).toFixed(1)}% vs history ${history.avgTotal.toFixed(2)} (${history.count} invoices)`,
      });
    }
  }

  const severity = maxSeverity(...findings.map((f) => f.severity));
  return {
    severity,
    passed: RANK[severity] <= RANK.INFO,
    findings,
    stats: { invoices: docs.length, avgTotal, historyAvgTotal: history.avgTotal, historyCount: history.count },
  };
}
