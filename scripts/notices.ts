// Uploads notices to Blob `notices/` and (re)indexes them in AI Search.
// `pnpm notices --without-letter` removes the provider letter from the index (demo step 4).
import { makeBlob } from "../src/azure/blob";
import { makeSearch } from "../src/azure/search";
import { loadConfig } from "../src/config";
import { LETTER_ID, loadLocalNotices } from "../src/demo/notices";

const cfg = loadConfig();
const withoutLetter = process.argv.includes("--without-letter");
const blob = makeBlob(cfg);
const search = makeSearch(cfg);
const notices = loadLocalNotices();

await search.createIndex();
for (const n of notices) await blob.upload("notices", `${n.id}.md`, Buffer.from(n.content), "text/markdown");
const wanted = withoutLetter ? notices.filter((n) => n.id !== LETTER_ID) : notices;
await search.upsert(wanted);
// Keep the index in sync with data/notices: remove anything else (renamed files, the letter when --without-letter)
const stale = (await search.all()).map((n) => n.id).filter((id) => !wanted.some((n) => n.id === id));
if (stale.length) await search.remove(stale);
console.log(`indexed ${(await search.all()).length} notices${withoutLetter ? " (provider letter removed)" : ""}`);
