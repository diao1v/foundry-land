import { z } from "zod";

const Env = z
  .object({
    DATABASE_URL: z.string().url(),
    PORT: z.coerce.number().default(3000),
    PUBLIC_URL: z.string().url().optional(),
    AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
    STORAGE_ACCOUNT: z.string().optional(),
    DOCINT_ENDPOINT: z.string().url(),
    DOCINT_KEY: z.string().optional(), // empty → managed identity / az login token
    SEARCH_ENDPOINT: z.string().url(),
    SEARCH_ADMIN_KEY: z.string().optional(), // empty → Entra token
    SEARCH_CONNECTION_NAME: z.string().default("search"),
    FOUNDRY_PROJECT_ENDPOINT: z.string().url(),
    MODEL_DEPLOYMENT: z.string(),
    APPLICATIONINSIGHTS_CONNECTION_STRING: z.string().optional(),
    REVIEW_WEBHOOK_URL: z.string().url().optional(),
    // Foundry portal page of each agent, linked from its step
    FOUNDRY_DRIFT_ANALYST_AGENTS_URL: z.string().url().optional(),
    FOUNDRY_INVESTIGATOR_AGENTS_URL: z.string().url().optional(),
    FOUNDRY_FIX_PROPOSER_AGENTS_URL: z.string().url().optional(),
    EVENT_SECRET: z.string().min(16),
  })
  .refine((e) => e.AZURE_STORAGE_CONNECTION_STRING || e.STORAGE_ACCOUNT, {
    message: "Set AZURE_STORAGE_CONNECTION_STRING or STORAGE_ACCOUNT",
  })
  .transform((e) => ({ ...e, PUBLIC_URL: e.PUBLIC_URL ?? `http://localhost:${e.PORT}` }));

export type Config = z.infer<typeof Env>;
// An empty line in .env (e.g. `DOCINT_KEY=`) means "not set"
export const parseConfig = (env: Record<string, string | undefined>): Config =>
  Env.parse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== "")));
export const loadConfig = () => parseConfig(process.env);
