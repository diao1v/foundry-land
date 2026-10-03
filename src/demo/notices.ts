import { readdirSync, readFileSync } from "node:fs";
import type { Notice } from "../agents/citations";

const DIR = new URL("../../data/notices/", import.meta.url);
export const LETTER_ID = "provider-letter-example-dental";

export function loadLocalNotices(): Notice[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const content = readFileSync(new URL(f, DIR), "utf8");
      return { id: f.replace(/\.md$/, ""), title: content.match(/^#\s+(.+)$/m)?.[1] ?? f, content };
    });
}
