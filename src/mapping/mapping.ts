import { z } from "zod";
import { evaluate, parseExpression } from "./expr";
import { parseMoney } from "./money";

export const FieldRule = z.object({
  field: z.string(),
  labels: z.array(z.string()).min(1),
  match: z.enum(["exact", "prefix"]),
});
export const DerivedRule = z.object({ field: z.string(), expression: z.string() });
export const Mapping = z.object({
  fields: z.array(FieldRule),
  derived: z.array(DerivedRule).default([]),
  ignore: z.array(z.string()).default([]), // labels we expect and don't need
});
export type FieldRule = z.infer<typeof FieldRule>;
export type Mapping = z.infer<typeof Mapping>;

export const REQUIRED_FIELDS = ["provider_no", "invoice_no", "total"] as const;

export type RawField = { label: string; value: string; confidence: number };
export type SourceDoc = { documentId: number; fields: RawField[]; lineItemsTotal: number | null };
export type MappedDoc = {
  values: Record<string, string>;
  confidence: Record<string, number>;
  unmappedLabels: string[];
};

export const normalizeLabel = (label: string) => label.trim().replace(/\s*:$/, "");

const matches = (rule: FieldRule, label: string) =>
  rule.labels.some((l) => (rule.match === "exact" ? label === l : label.startsWith(l)));

export const fieldForLabel = (mapping: Mapping, label: string) =>
  mapping.fields.find((r) => matches(r, normalizeLabel(label)))?.field;

export function applyMapping(mapping: Mapping, fields: RawField[]): MappedDoc {
  const values: Record<string, string> = {};
  const confidence: Record<string, number> = {};
  const unmappedLabels: string[] = [];
  for (const f of fields) {
    const label = normalizeLabel(f.label);
    const field = fieldForLabel(mapping, label);
    if (field) {
      if (!(field in values) && f.value.trim()) {
        values[field] = f.value.trim();
        confidence[field] = f.confidence;
      }
    } else if (!mapping.ignore.includes(label)) unmappedLabels.push(label);
  }
  for (const d of mapping.derived) {
    const expr = parseExpression(d.expression);
    const nums = Object.fromEntries(expr.refs.map((r) => [r, parseMoney(values[r])]));
    if (expr.refs.every((r) => nums[r] != null)) {
      values[d.field] = evaluate(expr, nums as Record<string, number>).toFixed(2);
    }
  }
  return { values, confidence, unmappedLabels };
}

export function labelSamples(docs: SourceDoc[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const d of docs) {
    for (const f of d.fields) {
      const samples = (out[normalizeLabel(f.label)] ??= []);
      if (samples.length < 3) samples.push(f.value);
    }
  }
  return out;
}
