import type { Citation } from "./schemas";

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
