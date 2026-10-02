import { Check, Loader2, Minus } from "lucide-react";
import type { StepStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

// Small status marks. Colour only means something: red = failed, amber = warning, coral = needs you, green = approved.
export function StatusMark({ status, n, active, tone }: { status: StepStatus; n: number; active?: boolean; tone?: "ok" }) {
  const base = "grid size-[18px] shrink-0 place-items-center rounded-full text-[10px] font-bold";
  if (status === "running") return <Loader2 className={cn("size-[18px] animate-spin", active ? "text-white" : "text-navy")} />;
  if (status === "done")
    return (
      <span className={cn(base, tone === "ok" ? "bg-ok text-white" : active ? "bg-white text-navy" : "bg-navy text-white")}>
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  if (status === "failed") return <span className={cn(base, "bg-white text-bad ring-2 ring-inset ring-bad")}>!</span>;
  if (status === "warning") return <span className={cn(base, "bg-white text-warn ring-2 ring-inset ring-warn")}>!</span>;
  if (status === "waiting") return <span className={cn(base, "needs-you bg-coral text-white")}>{n}</span>;
  if (status === "skipped")
    return (
      <span className={cn(base, "bg-muted text-muted-foreground")}>
        <Minus className="size-3" strokeWidth={3} />
      </span>
    );
  return <span className={cn(base, "bg-white text-navy-muted ring-2 ring-inset ring-border")}>{n}</span>;
}
