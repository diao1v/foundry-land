import { readdirSync, readFileSync } from "node:fs";
import type { Notice } from "../agents/citations";

const NOTICES = new URL("../../data/notices/", import.meta.url);
const PROJECT = new URL("../../data/project/", import.meta.url);
export const LETTER_ID = "provider-letter-example-dental";

// Every .md file is one document: id = file name, title = first "# " heading, content = the whole file
function loadMarkdown(dir: URL): Notice[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const content = readFileSync(new URL(f, dir), "utf8");
      return { id: f.replace(/\.md$/, ""), title: content.match(/^#\s+(.+)$/m)?.[1] ?? f, content };
    });
}

export const loadLocalNotices = () => loadMarkdown(NOTICES);
export const loadProjectDocs = () => loadMarkdown(PROJECT);
