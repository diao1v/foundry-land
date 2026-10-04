import { Maximize2, MessageCircle, Minimize2, Minus, Send } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ChatReply, postJsonFor } from "@/lib/api";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; sources?: ChatReply["sources"]; error?: boolean };
type Rect = { x: number; y: number; w: number; h: number };
const SUGGESTED = ["How do the Azure services fit together?", "What stops the agents making things up?", "What happens when an agent fails?"];
const SMALL = { w: 380, h: 520 };
const MIN = { w: 300, h: 340 };
const GAP = 16;
const KEY = "chat-window";

const large = () => ({ w: Math.min(640, innerWidth - 2 * GAP), h: Math.round(innerHeight * 0.75) });
const corner = ({ w, h }: { w: number; h: number }): Rect => ({ x: innerWidth - w - 24, y: innerHeight - h - 24, w, h });
// keep the window inside the browser window
const clamp = (r: Rect): Rect => {
  const w = Math.min(Math.max(r.w, MIN.w), innerWidth - 2 * GAP);
  const h = Math.min(Math.max(r.h, MIN.h), innerHeight - 2 * GAP);
  return { w, h, x: Math.min(Math.max(r.x, GAP), innerWidth - w - GAP), y: Math.min(Math.max(r.y, GAP), innerHeight - h - GAP) };
};
const saved = (): Rect | null => {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? "null") as Rect | null;
    return r && [r.x, r.y, r.w, r.h].every(Number.isFinite) ? clamp(r) : null;
  } catch {
    return null;
  }
};
const save = (r: Rect) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* private window: just don't remember it */
  }
};
const usePhone = () => {
  const [phone, setPhone] = useState(() => matchMedia("(max-width: 640px)").matches);
  useEffect(() => {
    const m = matchMedia("(max-width: 640px)");
    const on = () => setPhone(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone;
};

function Dots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="chat-dot size-1.5 rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<string>();
  const [rect, setRect] = useState<Rect>(() => saved() ?? corner(SMALL));
  const phone = usePhone();
  const end = useRef<HTMLDivElement>(null);

  // braces: newer browsers return a Promise from scrollIntoView, which React would treat as a cleanup function
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy, open]);
  useEffect(() => {
    const fit = () => setRect((r) => clamp(r));
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, []);
  useEffect(() => save(rect), [rect]);

  // drag the title bar to move, the bottom-right corner to resize
  const track = (e: ReactPointerEvent, apply: (dx: number, dy: number, start: Rect) => Rect) => {
    if (phone || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const start = rect, sx = e.clientX, sy = e.clientY;
    const move = (ev: PointerEvent) => setRect(clamp(apply(ev.clientX - sx, ev.clientY - sy, start)));
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };
  const isLarge = rect.w >= large().w - 1 && rect.h >= large().h - 1;
  const toggleSize = () => setRect((r) => clamp({ ...r, ...(isLarge ? SMALL : large()), x: r.x + r.w - (isLarge ? SMALL : large()).w }));

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
      // fetch throws a TypeError when the server can't be reached at all
      const text = e instanceof TypeError ? "Can't reach the server. Check your connection and try again." : (e as Error).message;
      setMsgs([...next, { role: "assistant", content: text, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  if (!open)
    return (
      <Button onClick={() => setOpen(true)} className="fixed right-6 bottom-6 z-40 h-11 gap-2 rounded-full px-5 shadow-lg">
        {busy ? <Dots /> : <MessageCircle className="size-4" />} Ask about this project
      </Button>
    );

  return (
    <aside
      aria-label="Ask about this project"
      className={cn("fixed z-40 flex flex-col overflow-hidden border bg-card shadow-2xl", phone ? "inset-x-0 bottom-0 h-[75vh] rounded-t-2xl" : "rounded-xl")}
      style={phone ? undefined : { left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <header
        onPointerDown={(e) => track(e, (dx, dy, s) => ({ ...s, x: s.x + dx, y: s.y + dy }))}
        className={cn("flex items-center justify-between bg-navy px-4 py-2.5 text-white select-none", !phone && "cursor-move")}
      >
        <span className="font-semibold">Ask about this project</span>
        <span className="flex items-center gap-1">
          {!phone && (
            <button onClick={toggleSize} aria-label={isLarge ? "Smaller" : "Larger"} title={isLarge ? "Smaller" : "Larger"} className="rounded p-1 hover:bg-white/10">
              {isLarge ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          )}
          <button onClick={() => setOpen(false)} aria-label="Minimise" title="Minimise" className="rounded p-1 hover:bg-white/10"><Minus className="size-4" /></button>
        </span>
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
        {busy && (
          <div className="inline-flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-muted-foreground" role="status">
            <Dots /> Searching the project docs…
          </div>
        )}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(draft); }} className="flex gap-2 border-t p-3">
        <Input id="chat-input" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} disabled={busy} placeholder="Ask a question…" className="h-9" />
        <Button type="submit" disabled={busy || !draft.trim()} className="h-9" aria-label="Send"><Send className="size-4" /></Button>
      </form>
      {!phone && (
        <div
          onPointerDown={(e) => track(e, (dx, dy, s) => ({ ...s, w: s.w + dx, h: s.h + dy }))}
          className="absolute right-0 bottom-0 size-4 cursor-nwse-resize"
          aria-hidden
          style={{ background: "linear-gradient(135deg, transparent 50%, var(--color-border) 50%)" }}
        />
      )}
    </aside>
  );
}
