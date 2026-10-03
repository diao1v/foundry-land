import { useState } from "react";
import { useParams } from "react-router";
import { DecisionCard } from "@/components/DecisionCard";
import { NotFound, Shell } from "@/components/Shell";
import { StepContent } from "@/components/StepContent";
import { StepTabs } from "@/components/StepTabs";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { type BatchDetail, HttpError } from "@/lib/api";
import { usePoll } from "@/lib/usePoll";
import { cn } from "@/lib/utils";

const STILL_RUNNING = (d: BatchDetail) => !["LOADED", "RELOADED", "CLOSED", "ESCALATED", "AWAITING_REVIEW"].includes(d.batch.state);
const TAG: Record<string, [string, string]> = {
  AWAITING_REVIEW: ["Waiting for your review", "bg-coral-soft text-coral-ink"],
  LOADED: ["Loaded", "bg-ok-soft text-ok"],
  RELOADED: ["Reloaded", "bg-ok-soft text-ok"],
  CLOSED: ["Rejected", "bg-muted text-muted-foreground"],
  ESCALATED: ["Needs a person", "bg-warn-soft text-[#8A5A00]"],
};

// While running: follow the newest running step. Once finished: start of the story.
export function openingTab(d: BatchDetail) {
  return STILL_RUNNING(d) ? (d.steps.find((s) => s.status === "running")?.key ?? "checks") : "checks";
}

export function BatchReview() {
  const { id } = useParams();
  const { data: d, error, refresh } = usePoll<BatchDetail>(`/api/batches/${id}`, STILL_RUNNING);
  const [picked, setPicked] = useState<string>();

  if (error instanceof HttpError && error.status === 404)
    return <Shell crumbs={[{ label: "Batches", to: "/" }]}><NotFound what="Batch" /></Shell>;
  if (!d) return <Shell crumbs={[{ label: "Batches", to: "/" }]} error={error}><p className="text-muted-foreground">Loading…</p></Shell>;

  const tab = picked ?? openingTab(d);
  const [tagText, tagClass] = TAG[d.batch.state] ?? ["Agents working", "bg-[#E3E9F2] text-navy"];
  return (
    <Shell crumbs={[{ label: "Batches", to: "/" }, { label: d.batch.name }]} error={error}>
      <div className="flex items-center gap-3">
        <h1 className="text-[22px] font-semibold">{d.batch.name}</h1>
        <Badge className={cn("rounded-full px-2.5 text-[11px] font-semibold", tagClass)}>{tagText}</Badge>
      </div>
      <p className="text-muted-foreground">{d.provider} · {d.documents.length} invoices · mapping v{d.batch.mappingVersion ?? "–"}</p>

      <Tabs value={tab} onValueChange={setPicked} className="mt-4 gap-4">
        <StepTabs steps={d.steps} eventsCount={d.events.length} />
        <div className="grid grid-cols-[1fr_330px] items-start gap-4">
          <TabsContent value={tab} className="mt-0">
            <StepContent tab={tab} d={d} />
          </TabsContent>
          <DecisionCard d={d} onDone={refresh} />
        </div>
      </Tabs>
    </Shell>
  );
}
