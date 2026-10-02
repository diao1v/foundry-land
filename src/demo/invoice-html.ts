import { money, PROVIDER, type InvoiceData } from "./invoice-data";

const isTotalsLine = (label: string) => label === "GST" || label.startsWith("Total");

// "Label: value" lines are easy for Document Intelligence to read as key-value pairs.
// Line items go in a table with a "Fee" column; totals stay outside the table.
export function invoiceHtml(inv: InvoiceData): string {
  const kv = ([label, value]: [string, string]) => `<p><b>${label}:</b> ${value}</p>`;
  const rows = inv.lines.map((l) => `<tr><td>${l.desc}</td><td>${money(l.fee)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 20mm }
body { font: 12pt Arial, sans-serif }
h1 { font-size: 18pt; margin: 0 }
table { width: 100%; border-collapse: collapse; margin: 16px 0 }
th, td { border: 1px solid #999; padding: 6px; text-align: left }
.note { color: #777; font-size: 9pt; margin-top: 40px }
</style></head><body>
<h1>${PROVIDER.name}</h1>
<p>12 Example Street, Auckland</p>
<h2>Tax Invoice</h2>
${inv.fields.filter(([l]) => !isTotalsLine(l)).map(kv).join("\n")}
<table><thead><tr><th>Description</th><th>Fee</th></tr></thead><tbody>${rows}</tbody></table>
${inv.fields.filter(([l]) => isTotalsLine(l)).map(kv).join("\n")}
<p class="note">Fictional invoice generated for a software demo. Not a real provider or patient.</p>
</body></html>`;
}
