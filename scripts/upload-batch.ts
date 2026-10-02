// pnpm upload <dir> <batchName> [--post]
// Uploads the PDFs, then batch.json last. --post sends the BlobCreated event to the local app
// (on Azure, Event Grid sends it instead).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeBlob } from "../src/azure/blob";
import { loadConfig } from "../src/config";
import { blobCreatedEvent } from "../src/events";

const [dir, name] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!dir || !name) {
  console.error("usage: pnpm upload <dir> <batchName> [--post]");
  process.exit(1);
}
const cfg = loadConfig();
const blob = makeBlob(cfg);
const files = readdirSync(dir).filter((f) => f.endsWith(".pdf")).sort();
for (const f of files) await blob.upload("invoices", `${name}/${f}`, readFileSync(join(dir, f)), "application/pdf");
await blob.upload("invoices", `${name}/batch.json`, Buffer.from(JSON.stringify({ files, uploadedAt: new Date().toISOString() })), "application/json");
console.log(`uploaded ${files.length} PDFs + batch.json to invoices/${name}/`);

if (process.argv.includes("--post")) {
  const res = await fetch(`${cfg.PUBLIC_URL}/events/blob?key=${encodeURIComponent(cfg.EVENT_SECRET)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "aeg-event-type": "Notification" },
    body: JSON.stringify(blobCreatedEvent(`${name}/batch.json`)),
  });
  console.log(`posted BlobCreated event → ${res.status}`);
}
