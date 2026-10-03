import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { PdfCanvas } from "@/components/PdfCanvas";
import { NotFound, Shell } from "@/components/Shell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type DocumentView as View, HttpError } from "@/lib/api";
import { hitTest } from "@/lib/hitTest";
import { usePoll } from "@/lib/usePoll";
import { cn } from "@/lib/utils";

export function DocumentView() {
  const { id } = useParams();
  const [search, setSearch] = useSearchParams();
  const which = search.get("mapping") === "proposed" ? "proposed" : "batch";
  const { data: v, error } = usePoll<View>(`/api/documents/${id}?mapping=${which}`, () => false); // invoices don't change
  const [selectedLabel, setSelectedLabel] = useState<string>(); // default: the field mapped to total

  if (error instanceof HttpError && error.status === 404)
    return <Shell crumbs={[{ label: "Batches", to: "/" }]}><NotFound what="Invoice" /></Shell>;
  if (!v) return <Shell crumbs={[{ label: "Batches", to: "/" }]} error={error}><p className="text-muted-foreground">Loading…</p></Shell>;

  const selected = v.fields.find((f) => f.label === selectedLabel) ?? v.fields.find((f) => f.field === "total");
  const keep = which === "proposed" ? "?mapping=proposed" : "";
  const nav = (to: number | null, icon: React.ReactNode, label: string) =>
    to ? <Link to={`/documents/${to}${keep}`} aria-label={label} className="rounded p-0.5 hover:bg-muted">{icon}</Link>
       : <span className="p-0.5 opacity-30">{icon}</span>;

  return (
    <Shell crumbs={[{ label: "Batches", to: "/" }, { label: v.doc.batchName, to: `/batches/${v.doc.batchId}` }, { label: v.doc.name }]} error={error}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">{v.doc.name}</h1>
          <p className="text-muted-foreground">{v.mappedCount} of {v.fields.length} labels mapped · extracted by Document Intelligence</p>
        </div>
        {v.mapping.proposedAvailable && (
          <div className="inline-flex overflow-hidden rounded-lg border border-input text-[12.5px] font-semibold">
            {(["batch", "proposed"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setSearch(m === "proposed" ? { mapping: "proposed" } : {})}
                className={cn("px-3 py-1.5", which === m ? "bg-navy text-white" : "bg-white hover:bg-muted")}
              >
                {m === "batch" ? `Mapping v${which === "batch" ? v.mapping.version : v.mapping.version - 1}` : "Proposed fix"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-[auto_1fr] items-start gap-5">
        <Card className="gap-3 px-4 py-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{v.doc.name}.pdf</span>
            <span className="flex items-center gap-1">
              {nav(v.position.prevId, <ChevronLeft className="size-4" />, "Previous invoice")}
              {v.position.index} of {v.position.total}
              {nav(v.position.nextId, <ChevronRight className="size-4" />, "Next invoice")}
            </span>
          </div>
          <PdfCanvas
            url={`/api/documents/${v.doc.id}/pdf`}
            unit={v.doc.unit}
            selected={selected?.polygon}
            onPick={(x, y) => {
              const hit = hitTest(x, y, v.fields);
              const f = v.fields.find((x) => x.id === hit);
              if (f) setSelectedLabel(f.label);
            }}
          />
        </Card>

        <div>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {["Label on the PDF", "Value", "Maps to", "Confidence"].map((h) => (
                    <TableHead key={h} className="px-4 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {v.fields.map((f) => {
                  const on = f.id === selected?.id;
                  return (
                    <TableRow key={f.id} onClick={() => setSelectedLabel(f.label)} className={cn("h-11 cursor-pointer", on && "bg-navy text-white hover:bg-navy")}>
                      <TableCell className="px-4">{f.label}</TableCell>
                      <TableCell className="px-4 whitespace-nowrap">{f.value}</TableCell>
                      <TableCell className="px-4">
                        {f.field ? (
                          <>
                            <code className={cn("rounded px-1.5 py-0.5 font-mono text-[12px]", on ? "bg-navy-2 text-[#DCE5F2]" : "bg-muted")}>{f.field}</code>
                            {f.matchedBy === "prefix" && <span className={cn("ml-1.5 text-xs", on ? "text-navy-muted" : "text-muted-foreground")}>· prefix</span>}
                          </>
                        ) : (
                          <span className="rounded-full bg-coral-soft px-2 py-0.5 text-[11.5px] font-semibold text-coral-ink">not mapped</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4">
                        <span className="inline-flex items-center gap-2 font-mono text-[12px]">
                          <span className="relative h-1 w-10 overflow-hidden rounded-full bg-border">
                            <span className={cn("absolute inset-y-0 left-0", f.confidence < 0.7 ? "bg-warn" : "bg-ok")} style={{ width: `${Math.round(f.confidence * 100)}%` }} />
                          </span>
                          {f.confidence.toFixed(2)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {v.derived.length > 0 && (
            <Card className="mt-3 gap-1 px-5 py-3">
              {v.derived.map((d) => (
                <p key={d.field} className="text-[13px]">
                  <b className="font-semibold">Computed</b> <code className="rounded bg-muted px-1.5 font-mono text-[12px]">{d.field} = {d.expression}</code>
                  {" "}→ {d.value ?? <span className="text-muted-foreground">not computed (an input is missing on this invoice)</span>}
                </p>
              ))}
            </Card>
          )}

          {v.note && (
            <Card className="mt-3 gap-0 border-l-[3px] border-l-navy px-5 py-3 text-[13px]">
              <p><b className="font-semibold">Why this matters · </b>{v.note}</p>
            </Card>
          )}
        </div>
      </div>
    </Shell>
  );
}
