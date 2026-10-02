// Day-1 fail-fast checks against the real services.
import { readFileSync } from "node:fs";
import { makeBlob } from "../src/azure/blob";
import { analyzeLayout, toExtractedDoc } from "../src/azure/docint";
import { makeSearch } from "../src/azure/search";
import { loadConfig } from "../src/config";
import { applyMapping, Mapping, REQUIRED_FIELDS } from "../src/mapping/mapping";
import { parseMoney } from "../src/mapping/money";
import v1 from "../mappings/v1.json";

const cfg = loadConfig();
const PDF = "out/batches/normal/INV-10100.pdf";

async function step(name: string, fn: () => Promise<string>) {
  try {
    console.log(`PASS ${name}: ${await fn()}`);
  } catch (e) {
    console.log(`FAIL ${name}: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

await step("blob", async () => {
  const blob = makeBlob(cfg);
  await blob.upload("invoices", "smoke/INV-10100.pdf", readFileSync(PDF), "application/pdf");
  return `${(await blob.list("invoices", "smoke/")).length} file(s) under invoices/smoke/`;
});

await step("document intelligence", async () => {
  const doc = toExtractedDoc(await analyzeLayout(cfg, readFileSync(PDF)));
  console.table(doc.fields.map((f) => ({ label: f.label, value: f.value, confidence: f.confidence })));
  const mapped = applyMapping(Mapping.parse(v1), doc.fields);
  const missing = REQUIRED_FIELDS.filter((f) => !mapped.values[f]);
  if (missing.length) throw new Error(`not mapped: ${missing.join(", ")}; unmapped labels: ${mapped.unmappedLabels.join(", ")}`);
  if (mapped.unmappedLabels.length) console.log(`note: unmapped labels ${mapped.unmappedLabels.join(", ")} → add them to "ignore" in mappings/v1.json`);
  const total = parseMoney(mapped.values.total);
  if (doc.lineItemsTotal !== total) throw new Error(`line items ${doc.lineItemsTotal} ≠ total ${total}`);
  return `${doc.fields.length} fields; line items = total = ${total}; page ${doc.pageWidth}×${doc.pageHeight} ${doc.unit}`;
});

await step("ai search", async () => {
  const s = makeSearch(cfg);
  await s.createIndex();
  return `${(await s.all()).length} notices in the index`;
});
