// Plain-words helpers shared by the API and the web app. No runtime dependencies.
import type { FixOp } from "./fix";

export function describeOp(op: FixOp): string {
  switch (op.op) {
    case "addLabelAlias":
      return `Field "${op.field}" also accepts the label "${op.label}"`;
    case "addField":
      return `New field "${op.field}" from the label "${op.label}" (${op.match} match)`;
    case "derivedField":
      return `Compute "${op.field}" = ${op.expression} (only when every input is present)`;
  }
}

// The search tool leaves citation markers like 【6:0†source】 in agent text
export const cleanMarkers = (text: string) => text.replace(/【[^】]*】/g, "").trim();

export const pct = (change: number) => {
  const v = Math.abs(change * 100).toFixed(1);
  return v === "0.0" ? "0.0%" : `${change < 0 ? "−" : "+"}${v}%`;
};
