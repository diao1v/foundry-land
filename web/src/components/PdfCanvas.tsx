import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const SCALE = 0.95;
// Document Intelligence polygons for PDFs are in inches (72 PDF points per inch), origin top-left
const PER_UNIT = (unit: string) => (unit === "inch" ? 72 : 1) * SCALE;

export function PdfCanvas({ url, unit, selected, onPick }: { url: string; unit: string; selected?: number[]; onPick(x: number, y: number): void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<pdfjs.PDFPageProxy["render"]> | undefined;
    (async () => {
      try {
        const doc = await pdfjs.getDocument({ url }).promise;
        const page = await doc.getPage(1);
        if (cancelled || !canvas.current) return;
        const viewport = page.getViewport({ scale: SCALE });
        canvas.current.width = viewport.width;
        canvas.current.height = viewport.height;
        task = page.render({ canvas: canvas.current, viewport });
        await task.promise;
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [url]);

  const k = PER_UNIT(unit);
  const box = selected && selected.length >= 6 ? (() => {
    const xs = selected.filter((_, i) => i % 2 === 0).map((v) => v * k);
    const ys = selected.filter((_, i) => i % 2 === 1).map((v) => v * k);
    return { left: Math.min(...xs) - 3, top: Math.min(...ys) - 2, width: Math.max(...xs) - Math.min(...xs) + 6, height: Math.max(...ys) - Math.min(...ys) + 4 };
  })() : undefined;

  if (error) return <p className="p-6 text-muted-foreground">Could not show the PDF: {error}</p>;
  return (
    <div className="relative w-fit shadow-[0_1px_3px_rgba(11,27,51,.12),0_8px_24px_-12px_rgba(11,27,51,.25)]">
      <canvas
        ref={canvas}
        className="block cursor-crosshair"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onPick((e.clientX - r.left) / k, (e.clientY - r.top) / k);
        }}
      />
      {box && <div className="pointer-events-none absolute rounded-[3px] border-2 border-coral bg-coral/15 transition-all" style={box} />}
    </div>
  );
}
