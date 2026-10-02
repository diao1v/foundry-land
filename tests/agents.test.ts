import { expect, it } from "vitest";
import { verifyCitations } from "../src/agents/citations";
import { AgentOutputError, parseJsonText, runAgent } from "../src/agents/run";
import { FixProposal } from "../src/agents/schemas";

const proposal = { operations: [{ op: "addLabelAlias", field: "provider_no", label: "Provider ID" }], reasoning: "rename" };

it("reads JSON with or without code fences", () => {
  expect(parseJsonText('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  expect(parseJsonText(' {"a":1} ')).toEqual({ a: 1 });
  expect(parseJsonText("not json")).toBeUndefined();
});

it("returns valid output on the first try", async () => {
  const ask = async () => JSON.stringify(proposal);
  expect(await runAgent(ask, "fix-proposer", FixProposal, { x: 1 })).toEqual(proposal);
});

it("retries once with the validation error", async () => {
  const messages: string[] = [];
  const ask = async (_: string, m: string) => {
    messages.push(m);
    return messages.length === 1 ? '{"operations":[{"op":"deleteEverything"}]}' : JSON.stringify(proposal);
  };
  expect(await runAgent(ask, "fix-proposer", FixProposal, { x: 1 })).toEqual(proposal);
  expect(JSON.parse(messages[1])).toMatchObject({ input: { x: 1 }, yourPreviousReplyWasInvalid: expect.any(String) });
});

it("gives up after the retry", async () => {
  await expect(runAgent(async () => "sorry, I cannot", "fix-proposer", FixProposal, {})).rejects.toThrow(AgentOutputError);
});

const notices = [
  { id: "provider-letter", title: "provider-letter", content: "First, invoice totals will\nexclude GST. Thanks." },
  { id: "decoy", title: "decoy", content: "The member portal will be down on Sunday." },
];

it("keeps quotes that appear in a notice, and fixes the doc id", () => {
  const { verified, rejected } = verifyCitations(
    [
      { docId: "wrong-id", quote: "first, invoice totals   will exclude GST." },
      { docId: "provider-letter", quote: "Totals now include a surcharge." },
      { docId: "provider-letter", quote: "GST." },
    ],
    notices,
  );
  expect(verified).toEqual([{ docId: "provider-letter", quote: "first, invoice totals   will exclude GST." }]);
  expect(rejected).toHaveLength(2); // made-up quote, and a quote shorter than MIN_QUOTE
});
