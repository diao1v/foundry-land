export { pct } from "../../../src/present";

export const money = (n: number | null | undefined) => (n == null ? "–" : n.toFixed(2));

export function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
