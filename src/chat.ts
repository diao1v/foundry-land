// "Ask about this project": the project-guide agent answers; code keeps only quotes that are really in the docs.
import { z } from "zod";
import { type Notice, verifyCitations } from "./agents/citations";
import type { ProjectAnswer } from "./agents/schemas";
import { cleanMarkers } from "./present";

const Message = z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(500) });
export const ChatRequest = z.object({
  messages: z.array(Message).min(1).max(6).refine((m) => m.at(-1)?.role === "user", "The last message must be a question."),
});
export type ChatRequest = z.infer<typeof ChatRequest>;
export type ChatGuide = {
  ask(input: { question: string; history: z.infer<typeof Message>[] }): Promise<ProjectAnswer>;
  docs(): Promise<Notice[]>;
};
export type ChatReply = { answer: string; sources: { docId: string; title: string; quote: string }[] };
export const GUIDE_DOWN = "The project guide isn't available right now. Try again in a minute.";

// The docs are markdown; agents quote the words without list markers, "**" or "`". Compare words only.
const plain = (md: string) =>
  md.replace(/^\s*(#+|[-*]|\d+\.)\s+/gm, "").replace(/\*\*|`/g, "");

// Keep only sources whose quote is in the docs, word for word (markdown ignored)
export const verifySources = (sources: ProjectAnswer["sources"], docs: Notice[]) =>
  verifyCitations(
    sources.map((src) => ({ ...src, quote: plain(src.quote) })),
    docs.map((d) => ({ ...d, content: plain(d.content) })),
  );

export async function answerChat(req: ChatRequest, guide: ChatGuide): Promise<ChatReply> {
  const history = req.messages.slice(0, -1); // earlier turns, so follow-up questions make sense
  const reply = await guide.ask({ question: req.messages.at(-1)!.content, history });
  const docs = await guide.docs();
  const { verified, rejected } = verifySources(reply.sources, docs);
  if (rejected.length) console.warn(`chat: dropped ${rejected.length} unverified source(s)`);
  return {
    answer: cleanMarkers(reply.answer),
    sources: verified.map((s) => ({ ...s, title: docs.find((d) => d.id === s.docId)?.title ?? s.docId })), // quote shown without markdown
  };
}
