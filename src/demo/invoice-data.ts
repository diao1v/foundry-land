import { round2 } from "../mapping/money";

// One fictional provider. v1 = before 1 Oct 2026, v2 = from 1 Oct 2026.
export type Layout = "v1" | "v2";
export const PROVIDER = { name: "Example Orthopaedics Ltd", providerNo: "EO-20417" } as const;

const GST_RATE = 0.15;
const CONSULTATION = 180;
const PROCEDURES: [string, number][] = [
  ["Knee arthroscopy", 1450],
  ["Shoulder injection", 320],
  ["Fracture review", 260],
  ["Carpal tunnel release", 980],
  ["Ankle follow-up", 410],
];
const PATIENTS = ["Alex Sample", "Sam Placeholder", "Jordan Example", "Riley Demo", "Casey Test"];

export type InvoiceData = {
  layout: Layout;
  invoiceNo: string;
  date: string;
  lines: { desc: string; fee: number }[];
  lineItemsTotal: number;
  gst: number | null;
  total: number;
  fields: [string, string][];
};

export const money = (n: number) => `$${n.toFixed(2)}`;

export function makeInvoice(i: number, layout: Layout, date: string): InvoiceData {
  const [procedure, base] = PROCEDURES[i % PROCEDURES.length];
  const factor = layout === "v1" ? 1 + GST_RATE : 1; // v1 fees include GST, v2 fees exclude it
  const lines = [
    { desc: "Specialist consultation", fee: round2(CONSULTATION * factor) },
    { desc: procedure, fee: round2(base * factor) },
  ];
  const lineItemsTotal = round2(lines[0].fee + lines[1].fee);
  const gst = layout === "v2" ? round2(lineItemsTotal * GST_RATE) : null;
  const total = lineItemsTotal; // v1: incl. GST; v2: excl. GST (the meaning change)
  const invoiceNo = `INV-${10000 + i}`;
  const fields: [string, string][] = [
    [layout === "v1" ? "Provider No." : "Provider ID", PROVIDER.providerNo],
    ["Invoice No.", invoiceNo],
    ["Invoice Date", date],
    ["Date of Service", date],
    ["Patient", PATIENTS[i % PATIENTS.length]],
    ["Member No.", `M-${900000 + i}`],
    ...(gst == null ? [] : [["GST", money(gst)] as [string, string]]),
    [layout === "v1" ? "Total (incl. GST)" : "Total (excl. GST)", money(total)],
  ];
  return { layout, invoiceNo, date, lines, lineItemsTotal, gst, total, fields };
}

const day = (month: number, d: number) => new Date(Date.UTC(2026, month - 1, d)).toISOString().slice(0, 10);

export const BATCHES = {
  // 5 v1 invoices = one full procedure cycle
  normal: () => [0, 1, 2, 3, 4].map((k) => makeInvoice(100 + k, "v1", day(9, 15))),
  // 2 late-September v1 + 8 October v2
  demo: () =>
    Array.from({ length: 10 }, (_, k) =>
      k < 2 ? makeInvoice(200 + k, "v1", day(9, 29)) : makeInvoice(200 + k, "v2", day(10, k - 1)),
    ),
};

// ~2 months of past v1 invoices (12 full cycles), seeded straight into Postgres
export const historyInvoices = () => Array.from({ length: 60 }, (_, k) => makeInvoice(k, "v1", day(8, 1 + k)));
