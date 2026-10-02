export const round2 = (n: number) => Math.round(n * 100) / 100;

// "$1,234.50" → 1234.5; anything else → null
export function parseMoney(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[\s,$]/g, "");
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? round2(Number(cleaned)) : null;
}
