import type { DriftReport, VerifiedInvestigation } from "./agents/schemas";
import type { Severity } from "./checks";
import type { BatchState } from "./state";

export type StepKey = "checks" | "analyst" | "investigator" | "fix" | "decision";
export type StepStatus = "todo" | "running" | "done" | "failed" | "warning" | "waiting" | "skipped";
export type Step = { key: StepKey; label: string; status: StepStatus; summary: string };
export type StepInput = {
  state: BatchState;
  codeSeverity: Severity | null;
  drift: DriftReport | null;
  investigation: VerifiedInvestigation | null;
  proposals: { round: number; passed: boolean }[];
  events: { actor: string; action: string; details: unknown }[];
};

const KIND_WORDS = { rename: "rename", new_field: "new field", meaning_change: "meaning change", price_change: "price change" } as const;
const FINAL: BatchState[] = ["LOADED", "RELOADED", "CLOSED", "ESCALATED"];
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// Every summary is built from stored data only.
export function batchSteps(i: StepInput): Step[] {
  const has = (action: string) => i.events.some((e) => e.action === action);
  const unavailable = (agent: string) =>
    i.events.some((e) => e.action === "agent.unavailable" && (e.details as { agent?: string })?.agent === agent);
  const notReached: Pick<Step, "status" | "summary"> = FINAL.includes(i.state)
    ? { status: "todo", summary: "Not run" }
    : { status: "todo", summary: "Not started" };
  const passed = has("checks.passed");
  const skipped: Pick<Step, "status" | "summary"> = { status: "skipped", summary: "Not needed" };
  // loaded without a person because the clinic announced the new fee (and code verified it)
  const announced = i.events.some((e) => e.action === "batch.loaded" && !!(e.details as { announcedPriceChanges?: unknown })?.announcedPriceChanges);

  const checks: Pick<Step, "status" | "summary"> = has("extraction.failed")
    ? { status: "failed", summary: "Extraction failed" }
    : passed
      ? { status: "done", summary: "All passed" }
      : has("checks.failed")
        ? { status: "failed", summary: sentence(i.codeSeverity ?? "failed") }
        : { status: "running", summary: "Running…" };

  const analyst: Pick<Step, "status" | "summary"> = passed
    ? skipped
    : unavailable("drift-analyst")
      ? { status: "failed", summary: "Agent unavailable" }
      : i.drift
        ? {
            status: "done",
            summary: sentence(
              [...new Set(i.drift.findings.map((f) => f.kind).filter((k) => k !== "noise"))]
                .map((k) => KIND_WORDS[k as keyof typeof KIND_WORDS])
                .join(" + ") || "no real change",
            ),
          }
        : i.state === "INCIDENT_OPEN"
          ? { status: "running", summary: "Reading the check report…" }
          : notReached;

  const investigator: Pick<Step, "status" | "summary"> = passed
    ? skipped
    : unavailable("investigator")
      ? { status: "failed", summary: "Agent unavailable" }
      : i.investigation
        ? i.investigation.explanationFound
          ? { status: "done", summary: "Explanation found" }
          : { status: "warning", summary: "No explanation found" }
        : i.state === "ANALYSED"
          ? { status: "running", summary: "Searching notices…" }
          : notReached;

  const winner = i.proposals.find((p) => p.passed);
  const fix: Pick<Step, "status" | "summary"> = passed
    ? skipped
    : unavailable("fix-proposer")
      ? { status: "failed", summary: "Agent unavailable" }
      : winner
        ? { status: "done", summary: `Passed round ${winner.round}` }
        : i.proposals.length === 0 && (announced || i.events.some((e) => e.action === "review.requested" && (e.details as { loadAsIs?: boolean })?.loadAsIs))
          ? { status: "skipped", summary: "Not needed — price change announced" }
          : has("fix.rounds_exhausted")
          ? { status: "failed", summary: "No fix in 3 rounds" }
          : ["INVESTIGATED", "PROPOSED", "DRY_RUN"].includes(i.state)
            ? { status: "running", summary: `Round ${Math.max(1, i.proposals.length)}…` }
            : notReached;

  const person = (action: string) => i.events.find((e) => e.action === action)?.actor.replace(/^human:/, "") ?? "a person";
  const decision: Pick<Step, "status" | "summary"> =
    i.state === "LOADED"
      ? { status: "skipped", summary: announced ? "Loaded automatically — price change announced" : "Loaded automatically" }
      : i.state === "AWAITING_REVIEW"
        ? { status: "waiting", summary: "Waiting for you" }
        : i.state === "RELOADED"
          ? { status: "done", summary: `Approved by ${person("review.approved")}` }
          : i.state === "CLOSED"
            ? { status: "done", summary: has("review.rejected") ? `Rejected by ${person("review.rejected")}` : "Closed" }
            : i.state === "ESCALATED"
              ? { status: "warning", summary: "Needs a person" }
              : notReached;

  return [
    { key: "checks", label: "Checks", ...checks },
    { key: "analyst", label: "Analyst", ...analyst },
    { key: "investigator", label: "Investigator", ...investigator },
    { key: "fix", label: "Fix", ...fix },
    { key: "decision", label: "Your decision", ...decision },
  ];
}
