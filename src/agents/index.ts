import { askAgent } from "../azure/foundry";
import type { Config } from "../config";
import { runAgent, type Ask } from "./run";
import { DriftReport, FixProposal, Investigation, ProjectAnswer } from "./schemas";

export function makeAgents(cfg: Pick<Config, "FOUNDRY_PROJECT_ENDPOINT">) {
  const ask: Ask = (agent, message) => askAgent(cfg, agent, message);
  // agents with a search tool must search every time: seen live, the guide answered "I don't know" and the
  // investigator "no notice explains it" without searching
  const askAfterSearch: Ask = (agent, message) => askAgent(cfg, agent, message, { tool_choice: "required" });
  return {
    drift: (input: unknown) => runAgent(ask, "drift-analyst", DriftReport, input),
    investigate: (input: unknown) => runAgent(askAfterSearch, "investigator", Investigation, input),
    proposeFix: (input: unknown) => runAgent(ask, "fix-proposer", FixProposal, input),
    guide: (input: { question: string; history: { role: "user" | "assistant"; content: string }[] }) =>
      runAgent(askAfterSearch, "project-guide", ProjectAnswer, input),
  };
}
