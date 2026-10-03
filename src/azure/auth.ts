import { type AccessToken, DefaultAzureCredential } from "@azure/identity";

type Credential = { getToken(scope: string): Promise<AccessToken | null> };
let cred: Credential | undefined;

// Locally: your `az login`. On Container Apps: the managed identity.
// A token request can hang; like every Azure call it gets a timeout, so the caller's retry or escalation runs.
export const tokenFor =
  (scope: string, opts: { credential?: Credential; timeoutMs?: number } = {}) =>
  async () => {
    const c = opts.credential ?? (cred ??= new DefaultAzureCredential());
    const ms = opts.timeoutMs ?? 20_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Azure token for ${scope} timed out after ${ms} ms`)), ms);
    });
    try {
      const t = await Promise.race([c.getToken(scope), timeout]);
      if (!t) throw new Error(`No Azure token for ${scope}`);
      return t.token;
    } finally {
      clearTimeout(timer);
    }
  };
