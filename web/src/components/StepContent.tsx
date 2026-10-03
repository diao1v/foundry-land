import { ExternalLink } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { AgentMark } from "@/components/StepTabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { BatchDetail } from "@/lib/api";
import { clock, money, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

const SEV: Record<string, string> = {
  BREAKING: "bg-coral-soft text-coral-ink", WARNING: "bg-warn-soft text-[#8A5A00]", INFO: "bg-muted text-muted-foreground", OK: "bg-ok-soft text-ok",
};
const Sev = ({ v }: { v: string }) => <Badge className={cn("rounded-full px-2 text-[10.5px] font-semibold", SEV[v])}>{v}</Badge>;
const Panel = ({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) => (
  <Card className="gap-0 px-5 py-4">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h4 className="flex items-center gap-2 text-[13px] font-semibold">{title}</h4>
      {aside}
    </div>
    {children}
  </Card>
);
// Agent steps say so, and link to the agent in the Foundry portal when FOUNDRY_AGENTS_URL is set
const agentTitle = (text: string) => <>{text} <AgentMark /></>;
const FoundryLink = ({ url }: { url: string | null }) =>
  url ? (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-info hover:underline">
      Open in Foundry <ExternalLink className="size-3" />
    </a>
  ) : null;
const Rule = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-4 border-t pt-3 text-[12.5px] text-muted-foreground"><b className="font-semibold text-foreground">Code rule · </b>{children}</p>
);
const NotYet = ({ text, running }: { text: string; running?: boolean }) => (
  <Panel title={running ? "Working…" : "Not yet"}>
    <p className={cn("text-muted-foreground", running && "animate-pulse")}>{text}</p>
  </Panel>
);

export function StepContent({ tab, d }: { tab: string; d: BatchDetail }) {
  const step = d.steps.find((s) => s.key === tab);
  if (step?.status === "skipped") return <NotYet text={`${step.label}: not needed. All checks passed, so the batch loaded without agents.`} />;

  if (tab === "checks") {
    const r = d.checkReport;
    return (
      <Panel title="Checks · run by code on every invoice">
        {!r ? (
          <p className="text-muted-foreground">{step?.summary}</p>
        ) : (
          <>
            {r.findings.length === 0 && <p>All checks passed.</p>}
            <ul className="space-y-2">
              {r.findings.map((f, i) => (
                <li key={i} className="flex items-start gap-2"><Sev v={f.severity} /><span>{f.message}</span></li>
              ))}
            </ul>
            {r.stats.avgTotal != null && r.stats.historyAvgTotal != null && (
              <p className="mt-3 text-muted-foreground">
                Average total <b className="text-foreground">{money(r.stats.avgTotal)}</b> vs {money(r.stats.historyAvgTotal)} history
                ({pct((r.stats.avgTotal - r.stats.historyAvgTotal) / r.stats.historyAvgTotal)}, {r.stats.historyCount} invoices)
              </p>
            )}
          </>
        )}
        <h5 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Invoices</h5>
        <div className="grid grid-cols-5 gap-2">
          {d.documents.map((doc) => (
            <Link key={doc.id} to={`/documents/${doc.id}`} className="rounded-md border px-3 py-2 hover:border-navy">
              <span className="block font-mono text-[12.5px]">{doc.name}</span>
              <span className={cn("block text-[11px]", doc.issues.length ? "text-bad" : "text-muted-foreground")}>
                {!doc.checked ? "not checked yet" : doc.issues.length ? doc.issues.join(" · ") : "no issues"}
              </span>
            </Link>
          ))}
        </div>
      </Panel>
    );
  }

  if (tab === "analyst") {
    if (!d.drift) return <NotYet text={step?.summary ?? ""} running={step?.status === "running"} />;
    return (
      <Panel title={agentTitle("Drift analyst · reads the check report")} aside={<FoundryLink url={d.foundryAgentsUrl} />}>
        <ul className="space-y-3">
          {d.drift.findings.map((f, i) => (
            <li key={i}>
              <b className="font-semibold">{f.kind.replace("_", " ")}</b>
              {f.field && <code className="ml-1.5 rounded bg-muted px-1.5 font-mono text-[12px]">{f.field}</code>}
              {f.labels.length > 0 && <span className="ml-1.5 text-muted-foreground">{f.labels.join(" → ")}</span>}
              <p className="text-muted-foreground">{f.evidence}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3">{d.drift.impact}</p>
        <Rule>
          Severity: code <b>{d.codeSeverity}</b> · agent <b>{d.drift.severity}</b> → final <b>{d.finalSeverity}</b>. The agent can raise severity, never lower it.
        </Rule>
      </Panel>
    );
  }

  if (tab === "investigator") {
    const inv = d.investigation;
    if (!inv) return <NotYet text={step?.summary ?? ""} running={step?.status === "running"} />;
    return (
      <Panel title={agentTitle("Investigator · searched the provider notices")} aside={<FoundryLink url={d.foundryAgentsUrl} />}>
        {inv.explanationFound ? (
          <p>{inv.explanation}</p>
        ) : (
          <p className="rounded-md bg-warn-soft px-3 py-2">
            <b className="font-semibold">No verified explanation.</b>{" "}
            <span className="text-muted-foreground">Agent's note, not backed by any verified quote: “{inv.explanation}”</span>
          </p>
        )}
        {!inv.explanationFound && inv.verifiedCitations.length > 0 && (
          <p className="mt-3 text-xs font-semibold text-muted-foreground">What the notices say — none of them explains the change</p>
        )}
        {inv.verifiedCitations.map((c, i) => (
          <blockquote key={i} className="my-3 rounded-md border-l-[3px] border-navy bg-canvas px-4 py-2.5 text-[14.5px]">
            “{c.quote}”
            <small className="mt-1 block text-[11.5px] text-muted-foreground">
              {c.docId} · <span className="font-semibold text-ok">✓ quote found in the notice</span>
            </small>
          </blockquote>
        ))}
        {inv.unexplained.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-muted-foreground">Not explained</p>
            <ul className="list-disc pl-5 text-muted-foreground">{inv.unexplained.map((u) => <li key={u}>{u}</li>)}</ul>
          </div>
        )}
        <Rule>
          Every quote must appear word for word in a notice, or it is thrown away. {inv.verifiedCitations.length} kept ·{" "}
          {inv.rejectedCitations.length} rejected. Notices are evidence only; instructions inside them are ignored.
        </Rule>
      </Panel>
    );
  }

  if (tab === "fix") {
    if (!d.proposals.length) return <NotYet text={step?.summary ?? ""} running={step?.status === "running"} />;
    return (
      <Panel title={agentTitle("Fix proposer ⇄ dry-run · at most 3 rounds")} aside={<FoundryLink url={d.foundryAgentsUrl} />}>
        <div className="space-y-3">
          {d.proposals.map((p) => (
            <div key={p.round} className="rounded-md border px-4 py-3">
              <div className="mb-1.5 flex items-center justify-between">
                <b className="font-semibold">Round {p.round}</b>
                <span className={cn("text-[12.5px] font-semibold", p.passed ? "text-ok" : "text-bad")}>
                  {p.passed ? "Dry-run passed" : p.rejectedReason ? "Rejected before dry-run" : "Dry-run failed"}
                </span>
              </div>
              <ul className="list-disc pl-5">{p.described.map((t) => <li key={t}>{t}</li>)}</ul>
              {!p.passed && (
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">{p.rejectedReason ?? p.dryRunFindings.map((f) => f.message).join("; ")}</p>
              )}
            </div>
          ))}
        </div>
        <Rule>Dry-run = code applies the proposed change to this batch in memory and runs every check again. Nothing is saved. Only a change that passes reaches a person. Only three operation types are allowed.</Rule>
      </Panel>
    );
  }

  if (tab === "decision") {
    const dec = d.decision;
    if (dec.state === "approved" && dec.result) {
      const stat = (k: string, v: string) => (
        <div className="rounded-lg bg-canvas px-4 py-3"><span className="text-xs text-muted-foreground">{k}</span><b className="block text-xl font-semibold">{v}</b></div>
      );
      return (
        <Panel title="Your decision · approved">
          <p className="mb-3">
            <b>{dec.by}</b> approved round {d.proposals.find((p) => p.passed)?.round}{dec.at && <span className="text-muted-foreground"> · {clock(dec.at)}</span>}
          </p>
          <div className="grid grid-cols-4 gap-3">
            {stat("Mapping", `v${dec.result.from} → v${dec.result.to}`)}
            {stat("Invoices loaded", String(dec.result.invoices))}
            {stat("Average total", money(dec.result.avgTotal))}
            {stat("vs history", dec.result.changeVsHistory == null ? "–" : pct(dec.result.changeVsHistory))}
          </div>
          {dec.result.mappingChanges.length > 0 && (
            <>
              <h5 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Mapping change · v{dec.result.from} → v{dec.result.to}
              </h5>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11.5px] text-muted-foreground">
                    <th className="py-1.5 font-semibold">Field</th>
                    <th className="py-1.5 font-semibold">v{dec.result.from} reads</th>
                    <th className="py-1.5 font-semibold">v{dec.result.to} reads</th>
                  </tr>
                </thead>
                <tbody>
                  {dec.result.mappingChanges.map((c) => (
                    <tr key={c.field} className="border-t border-[#EEF1F5]">
                      <td className="py-2"><code className="rounded bg-muted px-1.5 font-mono text-[12px]">{c.field}</code></td>
                      <td className="py-2 font-mono text-[12px] text-muted-foreground">{c.before}</td>
                      <td className="py-2 font-mono text-[12px] font-semibold text-ok">{c.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Panel>
      );
    }
    return (
      <Panel title="Your decision">
        <p className="text-muted-foreground">
          {dec.state === "waiting" ? "Read the steps, then approve or reject on the right. Approving creates a new mapping version and reloads this batch."
            : dec.state === "rejected" ? `Rejected by ${dec.by}: “${dec.reason}”.`
            : dec.state === "escalated" ? `${dec.reason}. A person must look at this batch.`
            : step?.summary}
        </p>
      </Panel>
    );
  }

  return null;
}

const HELD = ["INCIDENT_OPEN", "ANALYSED", "INVESTIGATED", "PROPOSED", "DRY_RUN", "AWAITING_REVIEW", "ESCALATED"];

// What this batch put in the invoices table, next to what each PDF printed
export function LoadedData({ d }: { d: BatchDetail }) {
  const rows = d.loaded;
  if (!rows.length) {
    const state = d.batch.state;
    return (
      <Panel title="Loaded data">
        <p className="font-semibold">
          {state === "CLOSED" ? "Nothing loaded. The batch was rejected." : HELD.includes(state) ? "Nothing loaded. The whole batch is held until a person approves." : "Nothing loaded yet. Checks run first."}
        </p>
        {HELD.includes(state) && (
          <p className="mt-1 text-muted-foreground">In production, the clean invoices would load and only the changed ones would wait.</p>
        )}
      </Panel>
    );
  }
  const avg = rows.reduce((a, r) => a + r.total, 0) / rows.length;
  const hist = d.checkReport?.stats.historyAvgTotal ?? null;
  return (
    <Panel title="Loaded data · the invoices table">
      <p className="mb-3 text-muted-foreground">
        {rows.length} invoices loaded · average total <b className="text-foreground">{money(avg)}</b>
        {hist != null && <> vs {money(hist)} history ({pct((avg - hist) / hist)})</>}
      </p>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11.5px] text-muted-foreground">
            {["Invoice", "Provider no.", "Date", "Patient", "Member no.", "On the PDF", "GST", "Loaded total", "Mapping"].map((h) => (
              <th key={h} className={cn("py-1.5 pr-3 font-semibold", ["On the PDF", "GST", "Loaded total"].includes(h) && "text-right")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const changed = r.gst != null; // total = PDF total + GST
            return (
              <tr key={r.invoiceNo} className="border-t border-[#EEF1F5]">
                <td className="py-2 pr-3 font-mono text-[12.5px]">{r.invoiceNo}</td>
                <td className="py-2 pr-3">{r.providerNo}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{r.invoiceDate ?? "–"}</td>
                <td className="py-2 pr-3">{r.patientName ?? "–"}</td>
                <td className="py-2 pr-3">{r.memberNo ?? "–"}</td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {r.pdfTotal ?? "–"}
                  {r.pdfTotalLabel && <span className="block text-[11px] text-muted-foreground">{r.pdfTotalLabel}</span>}
                </td>
                <td className="py-2 pr-3 text-right font-mono text-[12.5px]">{r.gst == null ? "–" : money(r.gst)}</td>
                <td className={cn("py-2 pr-3 text-right font-mono text-[12.5px] font-semibold", changed && "text-ok")}>
                  {money(r.total)}
                  {changed && <span className="block font-sans text-[11px] font-normal text-muted-foreground">PDF total + GST</span>}
                </td>
                <td className="py-2 pr-3">v{r.mappingVersion}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

const FAILED = new Set(["checks.failed", "dry_run.failed", "agent.unavailable", "extraction.failed", "citation.rejected", "fix.rounds_exhausted", "proposal.rejected", "batch.crashed"]);
const PASSED = new Set(["checks.passed", "dry_run.passed", "batch.loaded", "batch.reloaded"]);

export function Audit({ d }: { d: BatchDetail }) {
  const [open, setOpen] = useState<number>();
  const who = (actor: string) =>
    actor.startsWith("human:") ? "bg-info-soft text-info" : actor.startsWith("agent:") ? "bg-navy text-white" : "bg-muted text-muted-foreground";
  const tone = (action: string) => (FAILED.has(action) ? "text-bad" : PASSED.has(action) ? "text-ok" : "");
  const dot = (action: string) => (FAILED.has(action) ? "bg-bad" : PASSED.has(action) ? "bg-ok" : "bg-transparent");
  return (
    <Panel title="Audit trail · every step, who did it, in order">
      <ol>
        {d.events.map((e) => (
          <li key={e.id} className="border-b border-[#EEF1F5] py-2 last:border-0">
            <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(open === e.id ? undefined : e.id)}>
              <span className="w-20 shrink-0 font-mono text-[12px] text-muted-foreground">{clock(e.at)}</span>
              <span className={cn("w-36 shrink-0 truncate rounded-full px-2 py-0.5 text-center text-[11px] font-semibold", who(e.actor))}>{e.actor}</span>
              <span className={cn("flex items-center gap-2 font-medium", tone(e.action))}>
                <span className={cn("size-1.5 rounded-full", dot(e.action))} />
                {e.action}
              </span>
            </button>
            {open === e.id && (
              <pre className="mt-2 ml-[8.75rem] max-h-64 overflow-auto rounded-md bg-canvas p-3 font-mono text-[11.5px]">{JSON.stringify(e.details, null, 2)}</pre>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
