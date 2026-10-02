import { expect, it } from "vitest";
import { parseConfig } from "../src/config";

const base = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5433/foundry_land",
  AZURE_STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true",
  DOCINT_ENDPOINT: "https://di.example.com/",
  SEARCH_ENDPOINT: "https://search.example.com",
  FOUNDRY_PROJECT_ENDPOINT: "https://f.example.com/api/projects/p",
  MODEL_DEPLOYMENT: "gpt-mini",
  EVENT_SECRET: "0123456789abcdef",
};

it("parses a full env and fills defaults", () => {
  const c = parseConfig(base);
  expect(c.PORT).toBe(3000);
  expect(c.PUBLIC_URL).toBe("http://localhost:3000");
  expect(c.SEARCH_CONNECTION_NAME).toBe("search");
});

it("needs a storage connection string or a storage account name", () => {
  const { AZURE_STORAGE_CONNECTION_STRING: _, ...rest } = base;
  expect(() => parseConfig(rest)).toThrow(/STORAGE_ACCOUNT/);
  expect(parseConfig({ ...rest, STORAGE_ACCOUNT: "stfoundryland" }).STORAGE_ACCOUNT).toBe("stfoundryland");
});

it("rejects a short event secret", () => {
  expect(() => parseConfig({ ...base, EVENT_SECRET: "short" })).toThrow();
});
