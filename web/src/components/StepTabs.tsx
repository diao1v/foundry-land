import { Clock } from "lucide-react";
import { StatusMark } from "@/components/StatusMark";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Step } from "@/lib/api";
import { cn } from "@/lib/utils";

const TRIGGER =
  "h-auto flex-1 justify-start gap-2.5 rounded-[7px] px-3 py-2 text-left text-foreground whitespace-normal shadow-none " +
  "data-active:bg-navy data-active:text-white data-active:shadow-none data-[state=active]:bg-navy data-[state=active]:text-white";

export function StepTabs({ steps, eventsCount }: { steps: Step[]; eventsCount: number }) {
  return (
    <TabsList className="h-auto w-full gap-1 rounded-[10px] border bg-card p-1 group-data-horizontal/tabs:h-auto">
      {steps.map((s, i) => (
        <TabsTrigger key={s.key} value={s.key} className={cn(TRIGGER, "group/step")}>
          <StepMark step={s} n={i + 1} />
          <span className="min-w-0">
            <span className="block text-[12.5px] leading-tight font-semibold">{s.label}</span>
            <span
              className={cn(
                "block truncate text-[11.5px] text-muted-foreground group-data-active/step:text-navy-muted group-data-[state=active]/step:text-navy-muted",
                s.status === "waiting" && "font-semibold text-coral-ink",
              )}
            >
              {s.summary}
            </span>
          </span>
        </TabsTrigger>
      ))}
      <span className="mx-1 my-1.5 w-px self-stretch bg-border" />
      <TabsTrigger value="timeline" className={cn(TRIGGER, "group/step max-w-40")}>
        <Clock className="size-[18px]" />
        <span>
          <span className="block text-[12.5px] leading-tight font-semibold">Timeline</span>
          <span className="block text-[11.5px] text-muted-foreground group-data-active/step:text-navy-muted group-data-[state=active]/step:text-navy-muted">
            {eventsCount} events
          </span>
        </span>
      </TabsTrigger>
    </TabsList>
  );
}

// The active tab is navy, so marks switch to their light version inside it
function StepMark({ step, n }: { step: Step; n: number }) {
  return (
    <span className="contents">
      <span className="group-data-active/step:hidden group-data-[state=active]/step:hidden">
        <StatusMark status={step.status} n={n} tone={step.key === "decision" && step.status === "done" && step.summary.startsWith("Approved") ? "ok" : undefined} />
      </span>
      <span className="hidden group-data-active/step:inline group-data-[state=active]/step:inline">
        <StatusMark status={step.status} n={n} active />
      </span>
    </span>
  );
}
