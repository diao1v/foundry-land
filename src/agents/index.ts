import { askAgent } from "../azure/foundry";
import type { Config } from "../config";
import { runAgent, type Ask } from "./run";
import { DriftReport, FixProposal, Investigation, ProjectAnswer } from "./schemas";

export function makeAgents(cfg: Pick<Config, "FOUNDRY_PROJECT_ENDPOINT">) {
  const ask: Ask = (agent, message) => askAgent(cfg, agent, message);
  return {
    drift: (input: unknown) => runAgent(ask, "drift-analyst", DriftReport, input),
    investigate: (input: unknown) => runAgent(ask, "investigator", Investigation, input),
    proposeFix: (input: unknown) => runAgent(ask, "fix-proposer", FixProposal, input),
    guide: (input: { question: string; history: { role: "user" | "assistant"; content: string }[] }) =>
      runAgent(ask, "project-guide", ProjectAnswer, input),
  };
}
