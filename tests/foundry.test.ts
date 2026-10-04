import { expect, it } from "vitest";
import { agentDefinitions } from "../src/agents/prompts";
import { responseText } from "../src/azure/foundry";

it("joins the text of message outputs and skips tool calls", () => {
  expect(
    responseText({
      output: [
        { type: "azure_ai_search_call" },
        { type: "message", content: [{ text: '{"a":' }, { text: "1}" }] },
      ],
    }),
  ).toBe('{"a":\n1}');
});

it("defines 4 agents; only the investigator and the project guide search; every prompt carries its JSON schema", () => {
  const defs = agentDefinitions("gpt-mini", "conn-id") as Record<string, { instructions: string; tools: unknown[] }>;
  expect(Object.keys(defs)).toEqual(["drift-analyst", "investigator", "fix-proposer", "project-guide"]);
  expect(defs["drift-analyst"].tools).toEqual([]);
  expect(defs["fix-proposer"].tools).toEqual([]);
  expect(JSON.stringify(defs.investigator.tools)).toContain('"index_name":"notices"');
  expect(JSON.stringify(defs["project-guide"].tools)).toContain('"index_name":"project-docs"');
  for (const d of Object.values(defs)) expect(d.instructions).toContain('"type":"object"');
  expect(defs.investigator.instructions).toMatch(/untrusted/i);
});
