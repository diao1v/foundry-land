// Renders page 1 with pdf.js and highlights the clicked field's bounding box.
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const viewer = document.getElementById("viewer");
const pdf = await pdfjsLib.getDocument(viewer.dataset.pdf).promise;
const page = await pdf.getPage(1);
const viewport = page.getViewport({ scale: 1.1 });
const canvas = viewer.querySelector("canvas");
canvas.width = viewport.width;
canvas.height = viewport.height;
await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

// Document Intelligence polygons are in inches for PDFs (72 PDF points per inch), origin top-left.
const toPx = (v) => v * (viewer.dataset.unit === "inch" ? 72 : 1) * viewport.scale;
const box = viewer.querySelector(".box");

for (const row of document.querySelectorAll("tr[data-polygon]")) {
  row.addEventListener("click", () => {
    const p = JSON.parse(row.dataset.polygon).map(toPx);
    if (!p.length) return;
    const xs = p.filter((_, i) => i % 2 === 0);
    const ys = p.filter((_, i) => i % 2 === 1);
    Object.assign(box.style, {
      display: "block",
      left: `${Math.min(...xs)}px`,
      top: `${Math.min(...ys)}px`,
      width: `${Math.max(...xs) - Math.min(...xs)}px`,
      height: `${Math.max(...ys) - Math.min(...ys)}px`,
    });
    document.querySelectorAll("tr.sel").forEach((r) => r.classList.remove("sel"));
    row.classList.add("sel");
  });
}
