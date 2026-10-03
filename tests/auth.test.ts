import { expect, it } from "vitest";
import { tokenFor } from "../src/azure/auth";

it("a token request that hangs fails after the timeout instead of blocking forever", async () => {
  const hanging = { getToken: () => new Promise<never>(() => {}) };
  const get = tokenFor("https://ai.azure.com/.default", { credential: hanging, timeoutMs: 50 });
  await expect(get()).rejects.toThrow(/token.*timed out after 50 ms/i);
});

it("returns the token when the credential answers", async () => {
  const ok = { getToken: async () => ({ token: "abc", expiresOnTimestamp: Date.now() + 60_000 }) };
  expect(await tokenFor("s", { credential: ok })()).toBe("abc");
});
