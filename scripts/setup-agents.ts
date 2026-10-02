import { agentDefinitions } from "../src/agents/prompts";
import { createVersion, foundryCall } from "../src/azure/foundry";
import { loadConfig } from "../src/config";

const cfg = loadConfig();
const conn = (await foundryCall(cfg, "GET", `/connections/${cfg.SEARCH_CONNECTION_NAME}`)) as { id: string };
for (const [name, definition] of Object.entries(agentDefinitions(cfg.MODEL_DEPLOYMENT, conn.id))) {
  const { version } = await createVersion(cfg, name, definition);
  console.log(`${name}: version ${version}`);
}
