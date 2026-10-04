import { afterEach, expect, it, vi } from "vitest";

vi.mock("../src/azure/auth", () => ({ tokenFor: () => async () => "token" }));
const { makeAgents } = await import("../src/agents");

afterEach(() => vi.restoreAllMocks());

const reply = (text: string) => new Response(JSON.stringify({ output: [{ type: "message", content: [{ text }] }] }));
const bodies = (fetch: { mock: { calls: unknown[][] } }) => fetch.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)));

// Seen live: the guide sometimes skipped the search and answered "I don't know" from nothing
it("makes the project guide search before it answers", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply('{"answer":"ok","sources":[]}'));
  await makeAgents({ FOUNDRY_PROJECT_ENDPOINT: "https://f.example.com" }).guide({ question: "q", history: [] });
  expect(bodies(fetch)[0].tool_choice).toBe("required");
});

// Seen live: the investigator answered "no notice explains it" without searching (3.5 s, no tool call)
it("makes the investigator search before it answers", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    reply('{"explanationFound":false,"explanation":"x","citations":[],"unexplained":[],"priceChanges":[]}'));
  await makeAgents({ FOUNDRY_PROJECT_ENDPOINT: "https://f.example.com" }).investigate({});
  expect(bodies(fetch)[0].tool_choice).toBe("required");
});

it("leaves the agents without a search tool free to choose", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply('{"findings":[],"severity":"INFO","impact":"none"}'));
  await makeAgents({ FOUNDRY_PROJECT_ENDPOINT: "https://f.example.com" }).drift({});
  expect(bodies(fetch)[0].tool_choice).toBeUndefined();
});
