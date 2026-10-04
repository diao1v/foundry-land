import { afterEach, expect, it, vi } from "vitest";
import { makeSearch } from "../src/azure/search";
import { loadLocalNotices, loadProjectDocs } from "../src/demo/notices";

afterEach(() => vi.restoreAllMocks());

it("loads the six project docs, whole, with their titles", () => {
  const docs = loadProjectDocs();
  expect(docs.map((d) => d.id)).toEqual([
    "agents-and-guardrails", "architecture", "batch-flow", "decisions", "limits-and-next-steps", "what-it-is",
  ]);
  for (const d of docs) {
    expect(d.title).not.toBe(`${d.id}.md`); // has a # heading
    expect(d.content.length).toBeGreaterThan(300);
  }
});

it("keeps the project docs public-safe", () => {
  const text = loadProjectDocs().map((d) => d.content).join("\n").toLowerCase();
  for (const word of ["interview", "southern cross", "pageproof", "azurecontainerapps.io", "pnpm ", "az "]) {
    expect(text, word).not.toContain(word);
  }
});

it("still loads the notices the same way", () => {
  expect(loadLocalNotices().map((n) => n.id)).toContain("provider-letter-example-dental");
});

it("talks to the index it was given", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ value: [] })));
  const cfg = { SEARCH_ENDPOINT: "https://s.example.com/", SEARCH_ADMIN_KEY: "k" };
  await makeSearch(cfg, "project-docs").all();
  await makeSearch(cfg).all();
  expect(fetch.mock.calls.map((c) => String(c[0]))).toEqual([
    "https://s.example.com/indexes/project-docs/docs/search?api-version=2024-07-01",
    "https://s.example.com/indexes/notices/docs/search?api-version=2024-07-01",
  ]);
});
