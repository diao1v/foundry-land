import { FileText, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const isPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

// Drop invoice PDFs → POST /api/uploads → open the new batch, where the steps light up live.
export function DropZone() {
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const add = (list: FileList | null) => {
    if (!list?.length) return;
    const pdfs = [...list].filter(isPdf);
    setError(pdfs.length < list.length ? "Only PDF files are accepted. Other files were skipped." : undefined);
    setFiles((prev) => [...prev, ...pdfs.filter((p) => !prev.some((q) => q.name === p.name))]);
  };

  const start = async () => {
    setBusy(true);
    setError(undefined);
    const form = new FormData();
    for (const f of files) form.append("files", f);
    try {
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { id?: number; error?: string };
      if (!res.ok || body.id == null) throw new Error(body.error ?? res.statusText);
      navigate(`/batches/${body.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Card
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
      className={cn("mt-5 gap-0 border-2 border-dashed px-6 py-5 shadow-none transition-colors", over ? "border-navy bg-white" : "border-input bg-transparent")}
    >
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <span className="grid size-10 place-items-center rounded-full bg-navy text-white"><Upload className="size-5" /></span>
          <div>
            <p className="font-semibold">Drop invoice PDFs here to start a batch</p>
            <p className="text-[12.5px] text-muted-foreground">
              or <button className="font-semibold text-navy underline-offset-4 hover:underline" onClick={() => input.current?.click()}>choose files</button>
              {" "}· up to 20 PDFs, 5 MB each · they go to Blob storage, then the pipeline starts
            </p>
          </div>
        </div>
        <Button className="h-9 px-5 font-semibold" disabled={!files.length || busy} onClick={() => void start()}>
          {busy ? `Uploading ${files.length} invoice${files.length === 1 ? "" : "s"}…` : files.length ? `Start batch (${files.length})` : "Start batch"}
        </Button>
      </div>
      <input ref={input} type="file" multiple accept="application/pdf" className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      {files.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {files.map((f) => (
            <li key={f.name} className="flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-[12.5px]">
              <FileText className="size-3.5 text-muted-foreground" />
              <span className="font-mono">{f.name}</span>
              <span className="text-muted-foreground">{kb(f.size)}</span>
              {!busy && (
                <button aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((x) => x !== f))}>
                  <X className="size-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 rounded-md bg-coral-soft px-3 py-2 text-[12.5px] text-coral-ink">{error}</p>}
    </Card>
  );
}
