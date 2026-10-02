import { expect, it } from "vitest";
import { withRetry } from "../src/retry";

it("retries until the call succeeds", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    if (calls < 3) throw new Error("flaky");
    return "ok";
  }, 3, 1);
  expect(result).toBe("ok");
  expect(calls).toBe(3);
});

it("throws the last error after the last try", async () => {
  await expect(withRetry(async () => { throw new Error("down"); }, 2, 1)).rejects.toThrow("down");
});
