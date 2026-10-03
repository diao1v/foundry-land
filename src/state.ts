export const STATES = [
  "RECEIVED", "EXTRACTED", "MAPPED", "CHECKED", "LOADED",
  "INCIDENT_OPEN", "ANALYSED", "INVESTIGATED", "PROPOSED", "DRY_RUN",
  "AWAITING_REVIEW", "ESCALATED", "RELOADED", "CLOSED",
] as const;
export type BatchState = (typeof STATES)[number];

const NEXT: Record<BatchState, BatchState[]> = {
  RECEIVED: ["EXTRACTED", "ESCALATED"],
  EXTRACTED: ["MAPPED"],
  MAPPED: ["CHECKED"],
  CHECKED: ["LOADED", "INCIDENT_OPEN"],
  INCIDENT_OPEN: ["ANALYSED", "ESCALATED"],
  ANALYSED: ["INVESTIGATED", "ESCALATED"],
  INVESTIGATED: ["PROPOSED", "AWAITING_REVIEW", "ESCALATED"], // → AWAITING_REVIEW: only announced price changes, load as is
  PROPOSED: ["DRY_RUN", "PROPOSED", "ESCALATED"], // PROPOSED → PROPOSED: operation rejected before dry-run
  DRY_RUN: ["AWAITING_REVIEW", "PROPOSED", "ESCALATED"],
  AWAITING_REVIEW: ["RELOADED", "CLOSED"],
  ESCALATED: ["CLOSED"],
  LOADED: [],
  RELOADED: [],
  CLOSED: [],
};

export const canTransition = (from: BatchState, to: BatchState) => NEXT[from].includes(to);
