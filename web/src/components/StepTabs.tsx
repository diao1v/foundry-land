import { Bot } from "lucide-react";
import { StatusMark } from "@/components/StatusMark";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Step } from "@/lib/api";
import { cn } from "@/lib/utils";

const TRIGGER =
  "h-auto flex-1 justify-start gap-2.5 rounded-[7px] px-3 py-2 text-left text-foreground whitespace-normal shadow-none " +
  "data-active:bg-navy data-active:text-white data-active:shadow-none data-[state=active]:bg-navy data-[state=active]:text-white";
const SUB = "block truncate text-[11.5px] text-muted-foreground group-data-active/step:text-navy-muted group-data-[state=active]/step:text-navy-muted";

// Steps run by a Foundry agent (the rest is code or a person)
export const AGENT_STEPS = new Set(["analyst", "investigator", "fix"]);

export function AgentMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-[9.5px] font-bold tracking-wide whitespace-nowrap uppercase",
        "bg-info-soft text-info group-data-active/step:bg-navy-2 group-data-active/step:text-navy-muted group-data-[state=active]/step:bg-navy-2 group-data-[state=active]/step:text-navy-muted",
        className,
      )}
    >
      <Bot className="size-2.5" strokeWidth={2.5} /> Agent
    </span>
  );
}

export function StepTabs({ steps }: { steps: Step[] }) {
  return (
    <TabsList className="h-auto w-full gap-1 rounded-[10px] border bg-card p-1 group-data-horizontal/tabs:h-auto">
      {steps.map((s, i) => (
        <TabsTrigger key={s.key} value={s.key} className={cn(TRIGGER, "group/step")}>
          <StepMark step={s} n={i + 1} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-[12.5px] leading-tight font-semibold">
              {s.label}
              {AGENT_STEPS.has(s.key) && <AgentMark />}
            </span>
            <span className={cn(SUB, s.status === "waiting" && "font-semibold text-coral-ink")}>{s.summary}</span>
          </span>
        </TabsTrigger>
      ))}
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
