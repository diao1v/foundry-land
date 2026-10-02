import { expect, it, vi } from "vitest";
import { analyzeLayout, toExtractedDoc, type AnalyzeResult } from "../src/azure/docint";

const box = (x: number, y: number) => [x, y, x + 1, y, x + 1, y + 0.2, x, y + 0.2];
const cell = (rowIndex: number, columnIndex: number, content: string) => ({ rowIndex, columnIndex, content });

const result: AnalyzeResult = {
  content: "",
  pages: [{ pageNumber: 1, width: 8.2639, height: 11.6806, unit: "inch" }],
  keyValuePairs: [
    {
      key: { content: "Provider No.:", boundingRegions: [{ pageNumber: 1, polygon: box(1, 1) }] },
      value: { content: "EO-20417", boundingRegions: [{ pageNumber: 1, polygon: box(2.2, 1) }] },
      confidence: 0.93,
    },
    { key: { content: "Member No.", boundingRegions: [{ pageNumber: 1, polygon: box(1, 2) }] }, confidence: 0.5 },
    { key: { content: "Knee" }, value: { content: "$1,667.50" }, confidence: 0.9 }, // a table row, read again as a pair
    { key: { content: "Consult" }, value: { content: "$207.00" }, confidence: 0.6 }, // the start of a table cell
  ],
  tables: [
    { cells: [cell(0, 0, "Description"), cell(0, 1, "Fee"), cell(1, 0, "Consultation"), cell(1, 1, "$207.00"), cell(2, 0, "Knee"), cell(2, 1, "$1,667.50")] },
  ],
};

it("turns a layout result into fields with boxes and a line-item total", () => {
  expect(toExtractedDoc(result)).toEqual({
    pageWidth: 8.2639,
    pageHeight: 11.6806,
    unit: "inch",
    lineItemsTotal: 1874.5,
    fields: [
      { label: "Provider No.", value: "EO-20417", confidence: 0.93, page: 1, polygon: box(2.2, 1) },
      { label: "Member No.", value: "", confidence: 0.5, page: 1, polygon: box(1, 2) }, // key with no value
    ],
  });
});

it("gives no line-item total when there is no Fee column or a fee is unreadable", () => {
  expect(toExtractedDoc({ ...result, tables: [] }).lineItemsTotal).toBeNull();
  const bad = { cells: [cell(0, 0, "Fee"), cell(1, 0, "call us")] };
  expect(toExtractedDoc({ ...result, tables: [bad] }).lineItemsTotal).toBeNull();
});

it("waits and retries when the free tier answers 429", async () => {
  const replies = [
    new Response("slow down", { status: 429, headers: { "retry-after": "0" } }),
    new Response(null, { status: 202, headers: { "Operation-Location": "https://di.example.com/op/1" } }),
    new Response(JSON.stringify({ status: "succeeded", analyzeResult: result })),
  ];
  const fetchMock = vi.fn(async () => replies.shift()!);
  vi.stubGlobal("fetch", fetchMock);
  try {
    const r = await analyzeLayout({ DOCINT_ENDPOINT: "https://di.example.com/", DOCINT_KEY: "k" }, Buffer.from("%PDF"));
    expect(r.pages[0].unit).toBe("inch");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  } finally {
    vi.unstubAllGlobals();
  }
});
