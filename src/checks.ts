import { type LineItem, REQUIRED_FIELDS, type MappedDoc } from "./mapping/mapping";
import { parseMoney, round2 } from "./mapping/money";

export type Severity = "OK" | "INFO" | "WARNING" | "BREAKING";
const RANK: Record<Severity, number> = { OK: 0, INFO: 1, WARNING: 2, BREAKING: 3 };
export const maxSeverity = (...s: Severity[]): Severity =>
  s.reduce<Severity>((a, b) => (RANK[b] > RANK[a] ? b : a), "OK");

export type Finding = {
  check: "schema" | "confidence" | "totals" | "fee";
  severity: Severity;
  message: string;
  docs?: number[];
  labels?: string[];
  field?: string; // schema: the required field that is missing
  procedure?: string; // fee: the procedure, its fee in this batch and the history median
  fee?: number;
  historyFee?: number;
  explained?: boolean; // fee: a verified notice announced this price
};
export type CheckDoc = { documentId: number; mapped: MappedDoc; lineItemsTotal: number | null; lineItems?: LineItem[] };
// fees: per procedure key, history fees on the loaded basis
export type History = { avgTotal: number | null; count: number; fees: Record<string, number[]> };
export type ExplainedFee = { procedure: string; newFee: number };
export type CheckReport = {
  severity: Severity;
  passed: boolean;
  findings: Finding[];
  stats: { invoices: number; avgTotal: number | null; historyAvgTotal: number | null; historyCount: number };
};

// Calibration knobs: check them against real Document Intelligence output on Day 1.
export const CONFIDENCE_MIN = 0.7;
export const FEE_DRIFT_MAX = 0.05;
const MIN_FEE_HISTORY = 3;

export const procedureKey = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// A line fee on the same basis as the loaded total (after derived fields): fee × total / line-items total
export function basisFees(d: CheckDoc): LineItem[] {
  const total = parseMoney(d.mapped.values.total);
  const k = total != null && d.lineItemsTotal ? total / d.lineItemsTotal : 1;
  return (d.lineItems ?? []).map((l) => ({ description: l.description, fee: round2(l.fee * k) }));
}

const present = (d: CheckDoc, field: string) =>
  field === "total" ? parseMoney(d.mapped.values.total) != null : Boolean(d.mapped.values[field]);

export function runChecks(docs: CheckDoc[], history: History, explained: ExplainedFee[] = []): CheckReport {
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

  // Fee check: same procedure, same provider → compare with the history median.
  // (The batch average depends on the case mix, so it is shown but decides nothing.)
  const byProc = new Map<string, { name: string; items: { doc: number; fee: number }[] }>();
  for (const d of docs) {
    for (const l of basisFees(d)) {
      const key = procedureKey(l.description);
      const e = byProc.get(key) ?? { name: l.description.trim(), items: [] };
      e.items.push({ doc: d.documentId, fee: l.fee });
      byProc.set(key, e);
    }
  }
  for (const [key, e] of byProc) {
    const hist = history.fees[key] ?? [];
    if (hist.length < MIN_FEE_HISTORY) continue;
    const historyFee = round2(median(hist));
    const off = e.items.filter((x) => Math.abs(x.fee - historyFee) / historyFee > FEE_DRIFT_MAX);
    if (!off.length) continue;
    const fee = round2(median(off.map((x) => x.fee)));
    const change = (fee - historyFee) / historyFee;
    const isExplained = explained.some((x) => procedureKey(x.procedure) === key && Math.abs(x.newFee - fee) <= 0.01);
    findings.push({
      check: "fee",
      severity: isExplained ? "INFO" : "WARNING",
      message: `Fee for "${e.name}" ${fee.toFixed(2)} is ${(change * 100).toFixed(1)}% vs history ${historyFee.toFixed(2)} (${hist.length} invoices)${isExplained ? " — announced by the clinic" : ""}`,
      docs: [...new Set(off.map((x) => x.doc))],
      procedure: e.name,
      fee,
      historyFee,
      ...(isExplained ? { explained: true } : {}),
    });
  }

  const totals = docs.map((d) => parseMoney(d.mapped.values.total)).filter((t): t is number => t != null);
  const avgTotal = totals.length ? round2(totals.reduce((a, b) => a + b, 0) / totals.length) : null;

  const severity = maxSeverity(...findings.map((f) => f.severity));
  return {
    severity,
    passed: RANK[severity] <= RANK.INFO,
    findings,
    stats: { invoices: docs.length, avgTotal, historyAvgTotal: history.avgTotal, historyCount: history.count },
  };
}
