// HTML → PDF with headless Chrome. Writes out/batches/<batch>/<invoiceNo>.pdf
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BATCHES } from "../src/demo/invoice-data";
import { invoiceHtml } from "../src/demo/invoice-html";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = resolve("out/batches");
rmSync(OUT, { recursive: true, force: true });

for (const [name, make] of Object.entries(BATCHES)) {
  const dir = join(OUT, name);
  mkdirSync(dir, { recursive: true });
  const invs = make();
  for (const inv of invs) {
    const html = join(tmpdir(), `${inv.invoiceNo}.html`);
    writeFileSync(html, invoiceHtml(inv));
    execFileSync(CHROME, [
      "--headless", "--disable-gpu", "--no-pdf-header-footer", "--print-to-pdf-no-header",
      `--print-to-pdf=${join(dir, `${inv.invoiceNo}.pdf`)}`, pathToFileURL(html).href,
    ], { stdio: "ignore" });
  }
  console.log(`${name}: ${invs.length} PDFs in ${dir}`);
}
