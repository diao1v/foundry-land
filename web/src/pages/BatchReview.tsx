import { useRef, useState } from "react";
import { useParams } from "react-router";
import { DecisionCard } from "@/components/DecisionCard";
import { NotFound, Shell } from "@/components/Shell";
import { Audit, LoadedData, StepContent } from "@/components/StepContent";
import { StepTabs } from "@/components/StepTabs";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type BatchDetail, HttpError } from "@/lib/api";
import { usePoll } from "@/lib/usePoll";
import { cn } from "@/lib/utils";

const VIEW = "h-auto flex-none rounded-none px-1 pb-2 text-[13px] font-semibold text-muted-foreground data-active:text-foreground data-[state=active]:text-foreground";
const STILL_RUNNING = (d: BatchDetail) => !["LOADED", "RELOADED", "CLOSED", "ESCALATED", "AWAITING_REVIEW"].includes(d.batch.state);
const CODE_STATES = ["RECEIVED", "EXTRACTED", "MAPPED", "CHECKED"];
const TAG: Record<string, [string, string]> = {
  AWAITING_REVIEW: ["Waiting for your review", "bg-coral-soft text-coral-ink"],
  LOADED: ["Loaded", "bg-ok-soft text-ok"],
  RELOADED: ["Reloaded", "bg-ok-soft text-ok"],
  CLOSED: ["Rejected", "bg-muted text-muted-foreground"],
  ESCALATED: ["Needs a person", "bg-warn-soft text-[#8A5A00]"],
};

// Chosen once, when the page opens: the step running at that moment, or the start of the story.
// It doesn't follow the run afterwards, so a finished step stays on screen until you pick another tab.
export function openingTab(d: BatchDetail) {
  return STILL_RUNNING(d) ? (d.steps.find((s) => s.status === "running")?.key ?? "checks") : "checks";
}

// A new batch (e.g. after "Run again") gets its own page state: opening tab, picked tab, view
export function BatchReview() {
  const { id } = useParams();
  return <BatchPage key={id} id={id} />;
}

function BatchPage({ id }: { id?: string }) {
  const { data: d, error, refresh } = usePoll<BatchDetail>(`/api/batches/${id}`, STILL_RUNNING);
  const [picked, setPicked] = useState<string>();
  const opened = useRef<string>(undefined);
  const [view, setView] = useState("data");

  if (error instanceof HttpError && error.status === 404)
    return <Shell crumbs={[{ label: "Batches", to: "/" }]}><NotFound what="Batch" /></Shell>;
  if (!d) return <Shell crumbs={[{ label: "Batches", to: "/" }]} error={error}><p className="text-muted-foreground">Loading…</p></Shell>;

  opened.current ??= openingTab(d);
  const tab = picked ?? opened.current;
  const working = CODE_STATES.includes(d.batch.state) ? "Checks running" : "Agents working"; // no agent runs before the checks fail
  const [tagText, tagClass] = d.decision.state === "rerun" ? ["Run again", TAG.CLOSED[1]] : (TAG[d.batch.state] ?? [working, "bg-[#E3E9F2] text-navy"]);
  return (
    <Shell crumbs={[{ label: "Batches", to: "/" }, { label: d.batch.name }]} error={error}>
      <div className="flex items-center gap-3">
        <h1 className="text-[22px] font-semibold">{d.batch.name}</h1>
        <Badge className={cn("rounded-full px-2.5 text-[11px] font-semibold", tagClass)}>{tagText}</Badge>
      </div>
      <p className="text-muted-foreground">{d.provider} · {d.documents.length} invoices · mapping v{d.batch.mappingVersion ?? "–"}</p>

      <Tabs value={tab} onValueChange={setPicked} activationMode="manual" className="mt-4 gap-4">
        <StepTabs steps={d.steps} />
        <div className="grid grid-cols-[1fr_330px] items-start gap-4">
          <TabsContent value={tab} className="mt-0">
            <StepContent tab={tab} d={d} />
          </TabsContent>
          <DecisionCard d={d} onDone={refresh} />
        </div>
      </Tabs>

      {/* Views of the batch, not pipeline steps */}
      <Tabs value={view} onValueChange={setView} activationMode="manual" className="mt-8 gap-3">
        <TabsList variant="line" className="h-auto gap-4 border-b p-0 group-data-horizontal/tabs:h-auto">
          <TabsTrigger value="data" className={VIEW}>Loaded data · {d.loaded.length}</TabsTrigger>
          <TabsTrigger value="audit" className={VIEW}>Audit · {d.events.length} events</TabsTrigger>
        </TabsList>
        <TabsContent value="data" className="mt-0"><LoadedData d={d} /></TabsContent>
        <TabsContent value="audit" className="mt-0"><Audit d={d} /></TabsContent>
      </Tabs>
    </Shell>
  );
}
