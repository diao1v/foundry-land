import type { Citation, PriceChange } from "./schemas";

export type Notice = { id: string; title: string; content: string };
export const MIN_QUOTE = 15;

const norm = (s: string) => s.replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();

// A quote counts only if it literally appears in a notice (spacing and case ignored).
export function verifyCitations(citations: Citation[], notices: Notice[]) {
  const verified: Citation[] = [];
  const rejected: Citation[] = [];
  for (const c of citations) {
    const q = norm(c.quote);
    const doc = q.length >= MIN_QUOTE ? notices.find((n) => norm(n.content).includes(q)) : undefined;
    if (doc) verified.push({ docId: doc.id, quote: c.quote });
    else rejected.push(c);
  }
  return { verified, rejected };
}

// A price change counts only if its quote is word for word in a notice AND names the procedure AND the new fee.
export function verifyPriceChanges(items: PriceChange[], notices: Notice[]) {
  const verified: PriceChange[] = [];
  const rejected: PriceChange[] = [];
  for (const p of items) {
    const q = norm(p.quote);
    const doc = q.length >= MIN_QUOTE ? notices.find((n) => norm(n.content).includes(q)) : undefined;
    const namesProcedure = q.includes(norm(p.procedure));
    const namesFee = q.replace(/[$,]/g, "").includes(p.newFee.toFixed(2));
    if (doc && namesProcedure && namesFee) verified.push({ ...p, docId: doc.id });
    else rejected.push(p);
  }
  return { verified, rejected };
}
