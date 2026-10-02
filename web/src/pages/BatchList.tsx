import { Link } from "react-router";
import { DropZone } from "@/components/DropZone";
import { Shell } from "@/components/Shell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BatchListResponse, BatchRow, Step } from "@/lib/api";
import { ago, money, pct } from "@/lib/format";
import { usePoll } from "@/lib/usePoll";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { text: (r: BatchRow) => string; dot: string; ink: string }> = {
  AWAITING_REVIEW: { text: () => "Waiting for your review", dot: "bg-coral needs-you", ink: "text-coral-ink" },
  LOADED: { text: () => "Loaded", dot: "bg-ok", ink: "text-ok" },
  RELOADED: { text: () => "Reloaded", dot: "bg-ok", ink: "text-ok" },
  CLOSED: { text: () => "Rejected", dot: "bg-navy-muted", ink: "text-muted-foreground" },
  ESCALATED: { text: (r) => `Needs a person · ${r.steps.find((s) => s.status === "failed" || s.status === "warning")?.summary ?? ""}`, dot: "bg-warn", ink: "text-warn" },
};
const running = (r: BatchRow) => {
  const step = r.steps.find((s) => s.status === "running");
  return { text: `Agents working${step ? ` · ${step.label}` : ""}`, dot: "bg-white ring-2 ring-inset ring-navy", ink: "text-navy" };
};

const BAR: Record<Step["status"], string> = {
  done: "bg-navy", failed: "bg-bad", warning: "bg-warn", waiting: "bg-coral", running: "bg-navy/40 animate-pulse", todo: "bg-border", skipped: "bg-border",
};

function Progress({ steps }: { steps: Step[] }) {
  const ok = steps.every((s) => s.status === "done" || s.status === "skipped") && steps[0].status === "done";
  return (
    <div className="flex gap-[3px]" aria-label={steps.map((s) => `${s.label}: ${s.summary}`).join(", ")}>
      {steps.map((s) => (
        <span key={s.key} className={cn("h-1 w-4 rounded-full", ok && s.status === "done" ? "bg-ok" : BAR[s.status])} />
      ))}
    </div>
  );
}

function Kpi({ value, label, needsYou }: { value: string; label: string; needsYou?: boolean }) {
  return (
    <Card className={cn("gap-1 px-5 py-4", needsYou && "border-t-[3px] border-t-coral")}>
      <div className={cn("text-2xl font-semibold tracking-tight", needsYou && "text-coral-ink")}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

export function BatchList() {
  const { data, error } = usePoll<BatchListResponse>("/api/batches");
  return (
    <Shell crumbs={[{ label: "Batches" }]} error={error}>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">Invoice batches</h1>
          <p className="text-muted-foreground">Example Orthopaedics Ltd · a batch starts when its folder lands in Blob storage</p>
        </div>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("size-[7px] rounded-full", error ? "bg-warn" : "bg-ok")} /> Live · updates every 2 s
        </span>
      </div>

      <DropZone />

      {data && (
        <>
          <div className="my-5 grid grid-cols-4 gap-3">
            <Kpi value={String(data.summary.waitingForReview)} label="Waiting for your review" needsYou={data.summary.waitingForReview > 0} />
            <Kpi value={String(data.summary.invoicesLoaded)} label="Invoices loaded" />
            <Kpi value={`v${data.summary.currentMapping}`} label="Current mapping" />
            <Kpi value={money(data.summary.history.avgTotal)} label={`History average total (${data.summary.history.count} invoices)`} />
          </div>

          <Card className="py-0">
            {data.batches.length === 0 ? (
              <p className="p-8 text-center text-muted-foreground">
                No batches yet. Upload one with <code className="font-mono text-[12.5px]">pnpm upload out/batches/demo demo-1 --post</code>
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {["Batch", "Status", "Progress", "Invoices", "Avg total vs history", "Mapping", "Updated", ""].map((h) => (
                      <TableHead key={h} className="px-4 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.batches.map((r) => {
                    const s = STATUS[r.state] ? { ...STATUS[r.state], text: STATUS[r.state].text(r) } : running(r);
                    const off = r.changeVsHistory != null && Math.abs(r.changeVsHistory) > 0.05;
                    return (
                      <TableRow key={r.id} className={cn("h-12", r.state === "AWAITING_REVIEW" && "bg-[#FFF8F6]")}>
                        <TableCell className="px-4 font-semibold">{r.name}</TableCell>
                        <TableCell className="px-4">
                          <span className={cn("inline-flex items-center gap-2 text-[12.5px] font-semibold", s.ink)}>
                            <span className={cn("size-2 rounded-full", s.dot)} />
                            {s.text}
                          </span>
                        </TableCell>
                        <TableCell className="px-4"><Progress steps={r.steps} /></TableCell>
                        <TableCell className="px-4">{r.invoices}</TableCell>
                        <TableCell className={cn("px-4 font-mono text-[12.5px]", off && "text-bad")}>
                          {r.changeVsHistory == null ? "–" : pct(r.changeVsHistory)}
                        </TableCell>
                        <TableCell className="px-4">{r.mappingVersion ? `v${r.mappingVersion}` : "–"}</TableCell>
                        <TableCell className="px-4 text-muted-foreground">{ago(r.updatedAt)}</TableCell>
                        <TableCell className="px-4 text-right">
                          <Link to={`/batches/${r.id}`} className="text-[12.5px] font-semibold hover:underline">
                            {r.state === "AWAITING_REVIEW" ? "Review →" : "Open →"}
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </Shell>
  );
}
