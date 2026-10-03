import { expect, it } from "vitest";
import { verifyCitations, verifyPriceChanges } from "../src/agents/citations";
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

// Seen live: Foundry's search tool failed for a few seconds and the agent replied with an error object
const toolFailed = '{"error":"Search required but tool call failed. Please retry."}';

it("waits and asks again (same input) when the agent reports its own failure", async () => {
  const messages: string[] = [];
  const ask = async (_: string, m: string) => (messages.push(m), messages.length <= 2 ? toolFailed : JSON.stringify(proposal));
  expect(await runAgent(ask, "fix-proposer", FixProposal, { x: 1 }, { waitMs: 1 })).toEqual(proposal);
  expect(messages.map((m) => JSON.parse(m))).toEqual([{ x: 1 }, { x: 1 }, { x: 1 }]);
});

it("gives up when the agent keeps reporting a failure", async () => {
  await expect(runAgent(async () => toolFailed, "fix-proposer", FixProposal, {}, { waitMs: 1 })).rejects.toThrow(/tool call failed/);
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

const priceNotice = { id: "price-update", title: "fee update", content: "From 1 November 2026, the fee for an extraction rises from $253.00 to $276.00 including GST. All other fees stay the same." };

it("verifies a price change only when the quote is in the notice and names the procedure and the new fee", () => {
  const quote = "the fee for an extraction rises from $253.00 to $276.00 including GST";
  const { verified, rejected } = verifyPriceChanges(
    [
      { procedure: "Extraction", newFee: 276, docId: "wrong-id", quote },
      { procedure: "Extraction", newFee: 270, docId: "price-update", quote }, // fee not in the quote
      { procedure: "Cleaning", newFee: 276, docId: "price-update", quote }, // procedure not in the quote
      { procedure: "Extraction", newFee: 276, docId: "price-update", quote: "the fee for an extraction rises to $276.00" }, // not word for word
    ],
    [priceNotice, ...notices],
  );
  expect(verified).toEqual([{ procedure: "Extraction", newFee: 276, docId: "price-update", quote }]);
  expect(rejected).toHaveLength(3);
});
