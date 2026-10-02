import { expect, it } from "vitest";
import { batchSteps, type StepInput } from "../src/steps";
import { DRIFT, INVESTIGATION } from "./fixtures";

const verified = { ...INVESTIGATION, verifiedCitations: INVESTIGATION.citations, rejectedCitations: [] };
const ev = (action: string, actor = "system", details: unknown = {}) => ({ action, actor, details });
const base: StepInput = { state: "RECEIVED", codeSeverity: null, drift: null, investigation: null, proposals: [], events: [] };
const brief = (i: StepInput) => batchSteps(i).map((s) => `${s.key}:${s.status}:${s.summary}`);

it("a normal batch: checks pass, agents not needed, decision not needed", () => {
  expect(brief({ ...base, state: "LOADED", events: [ev("checks.passed")] })).toEqual([
    "checks:done:All passed",
    "analyst:skipped:Not needed",
    "investigator:skipped:Not needed",
    "fix:skipped:Not needed",
    "decision:skipped:Loaded automatically",
  ]);
});

it("while extracting, checks are running and the rest has not started", () => {
  expect(brief({ ...base, state: "EXTRACTED" })).toEqual([
    "checks:running:Running…",
    "analyst:todo:Not started",
    "investigator:todo:Not started",
    "fix:todo:Not started",
    "decision:todo:Not started",
  ]);
});

it("mid-incident: the analyst is done and the investigator is running", () => {
  const s = batchSteps({ ...base, state: "ANALYSED", codeSeverity: "BREAKING", drift: DRIFT, events: [ev("checks.failed")] });
  expect(s.map((x) => x.status)).toEqual(["failed", "done", "running", "todo", "todo"]);
  expect(s[0].summary).toBe("Breaking");
  expect(s[1].summary).toBe("Rename + new field + meaning change");
  expect(s[2].summary).toBe("Searching notices…");
});

it("fix rounds show the current round while running", () => {
  const s = batchSteps({
    ...base, state: "PROPOSED", codeSeverity: "BREAKING", drift: DRIFT, investigation: verified,
    proposals: [{ round: 1, passed: false }, { round: 2, passed: false }], events: [ev("checks.failed")],
  });
  expect(s[3]).toMatchObject({ status: "running", summary: "Round 2…" });
});

it("waiting for review", () => {
  const s = batchSteps({
    ...base, state: "AWAITING_REVIEW", codeSeverity: "BREAKING", drift: DRIFT, investigation: verified,
    proposals: [{ round: 1, passed: true }], events: [ev("checks.failed")],
  });
  expect(s.map((x) => `${x.status}:${x.summary}`)).toEqual([
    "failed:Breaking", "done:Rename + new field + meaning change", "done:Explanation found",
    "done:Passed round 1", "waiting:Waiting for you",
  ]);
});

it("approved and rejected name the person", () => {
  const common = { ...base, codeSeverity: "BREAKING" as const, drift: DRIFT, investigation: verified, proposals: [{ round: 1, passed: true }] };
  expect(batchSteps({ ...common, state: "RELOADED", events: [ev("checks.failed"), ev("review.approved", "human:yiwei")] })[4])
    .toMatchObject({ status: "done", summary: "Approved by yiwei" });
  expect(batchSteps({ ...common, state: "CLOSED", events: [ev("checks.failed"), ev("review.rejected", "human:sam")] })[4])
    .toMatchObject({ status: "done", summary: "Rejected by sam" });
});

it("escalations: agent unavailable, no explanation, no fix in 3 rounds, extraction failed", () => {
  const down = batchSteps({ ...base, state: "ESCALATED", codeSeverity: "BREAKING",
    events: [ev("checks.failed"), ev("agent.unavailable", "system", { agent: "drift-analyst" })] });
  expect(down.map((x) => x.status)).toEqual(["failed", "failed", "todo", "todo", "warning"]);
  expect(down[1].summary).toBe("Agent unavailable");
  expect(down[2].summary).toBe("Not run");
  expect(down[4].summary).toBe("Needs a person");

  const noLetter = batchSteps({ ...base, state: "ESCALATED", codeSeverity: "BREAKING", drift: DRIFT,
    investigation: { ...verified, explanationFound: false, verifiedCitations: [] },
    proposals: [1, 2, 3].map((round) => ({ round, passed: false })),
    events: [ev("checks.failed"), ev("fix.rounds_exhausted")] });
  expect(noLetter[2]).toMatchObject({ status: "warning", summary: "No explanation found" });
  expect(noLetter[3]).toMatchObject({ status: "failed", summary: "No fix in 3 rounds" });

  const noPdf = batchSteps({ ...base, state: "ESCALATED", events: [ev("extraction.failed")] });
  expect(noPdf[0]).toMatchObject({ status: "failed", summary: "Extraction failed" });
});
