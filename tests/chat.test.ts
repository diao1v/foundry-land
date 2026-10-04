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

// Seen live: the agent quotes bullet points without the markdown "- " markers, and bold text without "**"
it("accepts a quote that spans markdown bullets or bold text, word for word", async () => {
  const docs: Notice[] = [{ id: "a", title: "A", content: "# A\n\n- **Loud:** a label is renamed.\n- Network errors are retried a few times.\n" }];
  const res = await ask(app({
    docs: async () => docs,
    ask: async () => ({ answer: "ok", sources: [{ docId: "A", quote: "Loud: a label is renamed.\n\nNetwork errors are retried a few times." }] }),
  }), { messages: [user("hi")] });
  expect((await res.json()).sources.map((s: { docId: string }) => s.docId)).toEqual(["a"]);
});

// Review: a normal answer (~120 words) is longer than 500 characters and comes back as history
it("accepts a follow-up after a long answer", async () => {
  const seen = vi.fn(async () => ({ answer: "ok", sources: [] }));
  const res = await ask(app({ ask: seen }), { messages: [user("How does it fit together?"), { role: "assistant", content: "x".repeat(1500) }, user("Why one replica?")] });
  expect(res.status).toBe(200);
  expect(seen).toHaveBeenCalled();
});

// Review: a hung agent must not keep the visitor waiting for minutes
it("gives up after the deadline with the friendly 503", async () => {
  const slow = makeApp(fakeDeps({}), {
    eventSecret: "test-secret-123456",
    pdf: async () => Buffer.from(""),
    upload: async () => {},
    chat: { ask: () => new Promise(() => {}), docs: async () => DOCS, deadlineMs: 50 },
  });
  const res = await ask(slow, { messages: [user("hi")] });
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: "The project guide isn't available right now. Try again in a minute." });
});

// Easter egg: an off-topic question gets a panda instead of a bare "I don't know"
it("marks an off-topic answer (no sources, 'I don't know from the project docs')", async () => {
  const off = await ask(app({ ask: async () => ({ answer: "I don't know from the project docs.", sources: [] }) }), { messages: [user("What's the capital of France?")] });
  expect(await off.json()).toMatchObject({ offTopic: true, sources: [] });
  const on = await ask(app({ ask: async () => ({ answer: "It retries.", sources: [{ docId: "x", quote: REAL }] }) }), { messages: [user("What if an agent fails?")] });
  expect((await on.json()).offTopic).toBeUndefined();
});
