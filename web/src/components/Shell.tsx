import type { ReactNode } from "react";
import { Link } from "react-router";
import { HttpError } from "@/lib/api";
import { ChatPanel } from "./ChatPanel";

type Crumb = { label: string; to?: string };

export function Shell({ crumbs, error, children }: { crumbs: Crumb[]; error?: Error; children: ReactNode }) {
  const offline = error && !(error instanceof HttpError && error.status === 404);
  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between px-8 py-3 text-[13px]">
          <nav className="flex items-center gap-2">
            <Link to="/" className="font-semibold">foundry-land</Link>
            {crumbs.map((c) => (
              <span key={c.label} className="flex items-center gap-2 text-navy-muted">
                <span>/</span>
                {c.to ? <Link to={c.to} className="hover:text-white">{c.label}</Link> : <span className="text-white/90">{c.label}</span>}
              </span>
            ))}
          </nav>
          <span className="text-navy-muted">Synthetic data</span>
        </div>
      </header>
      {offline && (
        <div className="bg-warn-soft px-8 py-1.5 text-center text-[12.5px] text-navy">Can't reach the server — retrying…</div>
      )}
      <main className="mx-auto max-w-[1360px] px-8 py-6">{children}</main>
      <ChatPanel />
    </div>
  );
}

export function NotFound({ what }: { what: string }) {
  return (
    <div className="rounded-xl border bg-card p-10 text-center">
      <p className="text-lg font-semibold">{what} not found</p>
      <p className="mt-1 text-muted-foreground">It may have been removed by a demo reset.</p>
      <Link to="/" className="mt-4 inline-block font-semibold underline-offset-4 hover:underline">← Back to batches</Link>
    </div>
  );
}
