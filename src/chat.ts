// "Ask about this project": the project-guide agent answers; code keeps only quotes that are really in the docs.
import { z } from "zod";
import { type Notice, verifyCitations } from "./agents/citations";
import type { ProjectAnswer } from "./agents/schemas";
import { cleanMarkers } from "./present";

// Questions are short; earlier answers come back as history and can be as long as the agent may write (2000)
const Message = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string().trim().min(1).max(500) }),
  z.object({ role: z.literal("assistant"), content: z.string().trim().min(1).max(2000) }),
]);
export const ChatRequest = z.object({
  messages: z.array(Message).min(1).max(6).refine((m) => m.at(-1)?.role === "user", "The last message must be a question."),
});
export type ChatRequest = z.infer<typeof ChatRequest>;
export type ChatGuide = {
  ask(input: { question: string; history: z.infer<typeof Message>[] }): Promise<ProjectAnswer>;
  docs(): Promise<Notice[]>;
  deadlineMs?: number; // whole answer, default 60 s: a hung agent must not keep the visitor waiting for minutes
};
export type ChatReply = { answer: string; sources: { docId: string; title: string; quote: string }[]; offTopic?: true };
const DONT_KNOW = /^i don.t know from the project docs/i;
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
  const ms = guide.deadlineMs ?? 60_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`chat: no answer within ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([answer(req, guide), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function answer(req: ChatRequest, guide: ChatGuide): Promise<ChatReply> {
  const history = req.messages.slice(0, -1); // earlier turns, so follow-up questions make sense
  const reply = await guide.ask({ question: req.messages.at(-1)!.content, history });
  const docs = await guide.docs();
  const { verified, rejected } = verifySources(reply.sources, docs);
  if (rejected.length) console.warn(`chat: dropped ${rejected.length} unverified source(s)`);
  const answer = cleanMarkers(reply.answer);
  const sources = verified.map((s) => ({ ...s, title: docs.find((d) => d.id === s.docId)?.title ?? s.docId })); // quote shown without markdown
  // off-topic: the web app answers with a panda instead of a bare "I don't know"
  return !sources.length && DONT_KNOW.test(answer) ? { answer, sources, offTopic: true } : { answer, sources };
}
