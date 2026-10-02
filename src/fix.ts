import { z } from "zod";
import { runChecks, type CheckReport, type History } from "./checks";
import { parseExpression } from "./mapping/expr";
import { applyMapping, type Mapping, type SourceDoc } from "./mapping/mapping";

export const FixOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("addLabelAlias"), field: z.string(), label: z.string() }),
  z.object({ op: z.literal("addField"), field: z.string(), label: z.string(), match: z.enum(["exact", "prefix"]) }),
  z.object({ op: z.literal("derivedField"), field: z.string(), expression: z.string() }),
]);
export type FixOp = z.infer<typeof FixOp>;

export class FixRejected extends Error {}

const FIELD_NAME = /^[a-z_][a-z0-9_]*$/;

export function applyFix(mapping: Mapping, ops: FixOp[]): Mapping {
  const next: Mapping = structuredClone(mapping);
  for (const op of ops) {
    if (!FIELD_NAME.test(op.field)) throw new FixRejected(`Bad field name "${op.field}"`);
    const known = new Set(next.fields.map((r) => r.field));
    if (op.op === "addLabelAlias") {
      const rule = next.fields.find((r) => r.field === op.field);
      if (!rule) throw new FixRejected(`addLabelAlias: unknown field "${op.field}"`);
      if (!rule.labels.includes(op.label)) rule.labels.push(op.label);
    } else if (op.op === "addField") {
      if (known.has(op.field)) throw new FixRejected(`addField: field "${op.field}" already exists`);
      next.fields.push({ field: op.field, labels: [op.label], match: op.match });
    } else {
      let refs: string[];
      try {
        refs = parseExpression(op.expression).refs;
      } catch (e) {
        throw new FixRejected((e as Error).message);
      }
      const unknown = refs.filter((r) => !known.has(r));
      if (unknown.length) throw new FixRejected(`derivedField: unknown field(s) ${unknown.join(", ")}`);
      next.derived.push({ field: op.field, expression: op.expression });
    }
  }
  return next;
}

// In memory only. Writes nothing.
export function dryRun(mapping: Mapping, ops: FixOp[], docs: SourceDoc[], history: History) {
  const next = applyFix(mapping, ops);
  const report: CheckReport = runChecks(
    docs.map((d) => ({ documentId: d.documentId, mapped: applyMapping(next, d.fields), lineItemsTotal: d.lineItemsTotal })),
    history,
  );
  return { mapping: next, report };
}
