import { MessageCircle, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ChatReply, postJsonFor } from "@/lib/api";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; sources?: ChatReply["sources"]; error?: boolean };
const SUGGESTED = ["How do the Azure services fit together?", "What stops the agents making things up?", "What happens when an agent fails?"];

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<string>();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setDraft("");
    setBusy(true);
    try {
      // the earlier turns go along, so follow-up questions make sense; errors are not sent back
      const history = next.filter((m) => !m.error).slice(-6).map(({ role, content }) => ({ role, content }));
      const r = await postJsonFor<ChatReply>("/api/chat", { messages: history });
      setMsgs([...next, { role: "assistant", content: r.answer, sources: r.sources }]);
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: (e as Error).message, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  if (!open)
    return (
      <Button onClick={() => setOpen(true)} className="fixed right-6 bottom-6 z-40 h-11 gap-2 rounded-full px-5 shadow-lg">
        <MessageCircle className="size-4" /> Ask about this project
      </Button>
    );

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l bg-card shadow-2xl sm:w-[380px]" aria-label="Ask about this project">
      <header className="flex items-center justify-between bg-navy px-4 py-3 text-white">
        <span className="font-semibold">Ask about this project</span>
        <button onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 hover:bg-white/10"><X className="size-4" /></button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-[14px]">
        {!msgs.length && (
          <div className="space-y-2">
            <p className="text-muted-foreground">Answers come only from the project's docs, with sources.</p>
            {SUGGESTED.map((s) => (
              <button key={s} onClick={() => send(s)} className="block w-full rounded-lg border px-3 py-2 text-left hover:bg-muted">{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("max-w-[90%] rounded-xl px-3 py-2", m.role === "user" ? "ml-auto bg-navy text-white" : m.error ? "bg-warn-soft text-navy" : "bg-muted")}>
            <p className="whitespace-pre-wrap">{m.content}</p>
            {!!m.sources?.length && (
              <div className="mt-2 flex flex-wrap gap-1">
                {m.sources.map((s, j) => (
                  <button key={j} onClick={() => setQuote(quote === s.quote ? undefined : s.quote)} className="rounded-full border bg-card px-2 py-0.5 text-[12px] hover:bg-muted">{s.title}</button>
                ))}
              </div>
            )}
            {m.sources?.some((s) => s.quote === quote) && <blockquote className="mt-2 border-l-2 pl-2 text-[12.5px] text-muted-foreground">“{quote}”</blockquote>}
          </div>
        ))}
        {busy && <p className="text-muted-foreground">Searching the project docs…</p>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(draft); }} className="flex gap-2 border-t p-3">
        <Input id="chat-input" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} disabled={busy} placeholder="Ask a question…" className="h-9" />
        <Button type="submit" disabled={busy || !draft.trim()} className="h-9" aria-label="Send"><Send className="size-4" /></Button>
      </form>
    </aside>
  );
}
