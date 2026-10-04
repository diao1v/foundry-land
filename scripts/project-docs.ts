// Uploads data/project/*.md to the AI Search index "project-docs" (used by the project-guide agent).
import { makeSearch } from "../src/azure/search";
import { loadConfig } from "../src/config";
import { loadProjectDocs } from "../src/demo/notices";

const search = makeSearch(loadConfig(), "project-docs");
const docs = loadProjectDocs();
await search.createIndex();
await search.upsert(docs);
const stale = (await search.all()).map((d) => d.id).filter((id) => !docs.some((d) => d.id === id));
if (stale.length) await search.remove(stale);
console.log(`indexed ${docs.length} project docs`);
