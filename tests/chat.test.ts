import { expect, it, vi } from "vitest";
import type { Notice } from "../src/agents/citations";
import { makeApp } from "../src/app";
import type { ChatGuide } from "../src/chat";
import { fakeDeps } from "./fixtures";

const DOCS: Notice[] = [
  { id: "agents-and-guardrails", title: "The agents and the guardrails around them", content: "At most 3 rounds, then a person is told. Agents cannot change anything." },
];
const REAL = "At most 3 rounds, then a person is told.";
const user = (content: string) => ({ role: "user" as const, content });

const app = (chat?: Partial<ChatGuide>) =>
  makeApp(fakeDeps({}), {
    eventSecret: "test-secret-123456",
    pdf: async () => Buffer.from(""),
    upload: async () => {},
    chat: chat && { ask: async () => ({ answer: "ok", sources: [] }), docs: async () => DOCS, ...chat },
  });
const ask = (a: ReturnType<typeof app>, body: unknown) =>
  a.request("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

it("answers with verified sources and their titles, without search markers", async () => {
  const res = await ask(app({ ask: async () => ({ answer: "It retries 【6:0†source】 then asks a person.", sources: [{ docId: "x", quote: REAL }] }) }), {
    messages: [user("What happens when an agent fails?")],
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    answer: "It retries then asks a person.",
    sources: [{ docId: "agents-and-guardrails", title: "The agents and the guardrails around them", quote: REAL }],
  });
});

it("drops quotes that are not in the docs", async () => {
  const res = await ask(app({ ask: async () => ({ answer: "I don't know from the project docs.", sources: [{ docId: "x", quote: "Made up sentence that is long enough." }] }) }), {
    messages: [user("What's the weather?")],
  });
  expect((await res.json()).sources).toEqual([]);
});

it("passes earlier turns as history", async () => {
  const seen = vi.fn(async () => ({ answer: "ok", sources: [] }));
  await ask(app({ ask: seen }), { messages: [user("What is it?"), { role: "assistant", content: "A pipeline." }, user("Why Foundry?")] });
  expect(seen).toHaveBeenCalledWith({ question: "Why Foundry?", history: [user("What is it?"), { role: "assistant", content: "A pipeline." }] });
});

it.each([
  ["7 messages", { messages: Array(7).fill(user("hi")) }],
  ["a 501-character message", { messages: [user("x".repeat(501))] }],
  ["only spaces", { messages: [user("   ")] }],
  ["last message not from the user", { messages: [user("hi"), { role: "assistant", content: "hello" }] }],
  ["no messages", { messages: [] }],
])("refuses %s with 400 and doesn't call the agent", async (_, body) => {
  const seen = vi.fn();
  const res = await ask(app({ ask: seen }), body);
  expect(res.status).toBe(400);
  expect(seen).not.toHaveBeenCalled();
});

it("returns a friendly 503 when the agent fails", async () => {
  const res = await ask(app({ ask: async () => { throw new Error("agent down"); } }), { messages: [user("hi")] });
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: "The project guide isn't available right now. Try again in a minute." });
});

it("returns the same 503 when the docs can't be loaded for the check", async () => {
  const res = await ask(app({ docs: async () => { throw new Error("search down"); } }), { messages: [user("hi")] });
  expect(res.status).toBe(503);
});

it("has no chat route when the chat isn't configured", async () => {
  expect((await ask(app(), { messages: [user("hi")] })).status).toBe(404);
});
