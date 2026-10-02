import { askAgent } from "../azure/foundry";
import type { Config } from "../config";
import { runAgent, type Ask } from "./run";
import { DriftReport, FixProposal, Investigation } from "./schemas";

export function makeAgents(cfg: Pick<Config, "FOUNDRY_PROJECT_ENDPOINT">) {
  const ask: Ask = (agent, message) => askAgent(cfg, agent, message);
  return {
    drift: (input: unknown) => runAgent(ask, "drift-analyst", DriftReport, input),
    investigate: (input: unknown) => runAgent(ask, "investigator", Investigation, input),
    proposeFix: (input: unknown) => runAgent(ask, "fix-proposer", FixProposal, input),
  };
}
