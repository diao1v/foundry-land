import type { FC, PropsWithChildren } from "hono/jsx";
import type { auditEvents, batches, documents, extractedFields, fixProposals, incidents } from "./db/schema";
import type { FixOp } from "./fix";

type Batch = typeof batches.$inferSelect;
type Incident = typeof incidents.$inferSelect;
type Proposal = typeof fixProposals.$inferSelect;
type Doc = typeof documents.$inferSelect;
type AuditEvent = typeof auditEvents.$inferSelect;
type FieldRow = typeof extractedFields.$inferSelect & { field?: string };

const CSS = `
body{font:15px/1.5 system-ui,sans-serif;margin:0;color:#1d1d1f;background:#fafafa}
header{background:#13315c;color:#fff;padding:10px 24px}header a{color:#fff;font-weight:600;text-decoration:none}
header span{opacity:.7;margin-left:12px;font-size:13px}
main{max-width:1400px;margin:0 auto;padding:16px 24px}
section{background:#fff;border:1px solid #e3e3e3;border-radius:8px;padding:12px 16px;margin:12px 0}
h2{font-size:16px;margin:0 0 8px}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #eee;padding:6px;text-align:left;vertical-align:top}
.badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600;background:#eee}
.OK,.LOADED,.RELOADED{background:#d3f5dd}.INFO{background:#dde8ff}
.WARNING,.AWAITING_REVIEW{background:#ffefc2}.BREAKING,.ESCALATED{background:#ffd6d6}
blockquote{margin:6px 0;padding:6px 12px;background:#f3f6fb;border-radius:6px}
.split{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:start}
#viewer{position:relative}#viewer canvas{border:1px solid #ccc}
.box{position:absolute;display:none;border:2px solid #e5484d;background:rgba(229,72,77,.15);pointer-events:none}
tr[data-polygon]{cursor:pointer}tr.sel{background:#fff3c4}
.muted{color:#777;font-size:13px}.nowrap{white-space:nowrap}form{display:inline-block;margin-right:12px}
`;

const Layout: FC<PropsWithChildren<{ title: string }>> = ({ title, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{`${title} · foundry-land`}</title>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </head>
    <body>
      <header>
        <a href="/">foundry-land</a>
        <span>Invoice intake demo · synthetic data</span>
      </header>
      <main>{children}</main>
    </body>
  </html>
);

const Badge = ({ v }: { v: string }) => <span class={`badge ${v}`}>{v}</span>;
const time = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const short = (details: unknown) => JSON.stringify(details).slice(0, 160);
// The search tool leaves citation markers like 【6:0†source】 in the text
const clean = (text: string) => text.replace(/【[^】]*】/g, "").trim();

export function describeOp(op: FixOp): string {
  switch (op.op) {
    case "addLabelAlias":
      return `Field "${op.field}" also accepts the label "${op.label}"`;
    case "addField":
      return `New field "${op.field}" from the label "${op.label}" (${op.match} match)`;
    case "derivedField":
      return `Compute "${op.field}" = ${op.expression} (only when every input is present)`;
  }
}

const RejectForm = ({ id }: { id: number }) => (
  <form method="post" action={`/batches/${id}/reject`}>
    <input type="hidden" name="reviewer" value="yiwei" />
    <input name="reason" placeholder="Reason" /> <button>Reject</button>
  </form>
);

export const BatchList: FC<{ rows: Batch[] }> = ({ rows }) => (
  <Layout title="Batches">
    <h1>Batches</h1>
    <section>
      <table>
        <thead>
          <tr><th>Batch</th><th>State</th><th>Mapping</th><th>Updated (UTC)</th></tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr>
              <td><a href={`/batches/${b.id}`}>{b.name}</a></td>
              <td><Badge v={b.state} /></td>
              <td>{b.mappingVersion ? `v${b.mappingVersion}` : "-"}</td>
              <td class="muted">{time(b.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </Layout>
);

export const BatchPage: FC<{ batch: Batch; incident?: Incident; proposals: Proposal[]; docs: Doc[]; events: AuditEvent[] }> = ({
  batch, incident, proposals, docs, events,
}) => {
  const passed = proposals.find((p) => p.passed);
  const drift = incident?.drift;
  const inv = incident?.investigation;
  return (
    <Layout title={batch.name}>
      <h1>{batch.name} <Badge v={batch.state} /></h1>
      <p class="muted">Mapping v{batch.mappingVersion ?? "-"} · {docs.length} invoices</p>

      {batch.state === "AWAITING_REVIEW" && passed && (
        <section>
          <h2>Your decision</h2>
          <p>Proposed mapping change — dry-run passed in round {passed.round}:</p>
          <ul>{passed.operations.map((op) => <li>{describeOp(op)}</li>)}</ul>
          <p class="muted">{passed.reasoning}</p>
          <form method="post" action={`/batches/${batch.id}/approve`}>
            <input name="reviewer" value="yiwei" /> <button>Approve and reload</button>
          </form>
          <RejectForm id={batch.id} />
        </section>
      )}

      {batch.state === "ESCALATED" && (
        <section>
          <h2>Needs a person</h2>
          <p>No verified fix. See the timeline for the reason.</p>
          <RejectForm id={batch.id} />
        </section>
      )}

      {incident && (
        <section>
          <h2>What failed <Badge v={incident.codeSeverity} /></h2>
          <ul>{incident.checkReport.findings.map((f) => <li><Badge v={f.severity} /> {f.message}</li>)}</ul>
        </section>
      )}

      {drift && (
        <section>
          <h2>Drift analyst <Badge v={incident!.finalSeverity ?? drift.severity} /></h2>
          <p class="muted">Code: {incident!.codeSeverity} · agent: {drift.severity} · final = the higher one</p>
          <ul>
            {drift.findings.map((f) => (
              <li><b>{f.kind}</b>{f.field ? ` (${f.field})` : ""}: {f.labels.join(" → ")} — {f.evidence}</li>
            ))}
          </ul>
          <p>{drift.impact}</p>
        </section>
      )}

      {inv && (
        <section>
          <h2>Investigator — {inv.explanationFound ? "explanation found" : "no explanation found"}</h2>
          <p>{clean(inv.explanation)}</p>
          {inv.verifiedCitations.map((c) => (
            <blockquote>“{c.quote}”<div class="muted">{c.docId} · quote checked against the notice</div></blockquote>
          ))}
          {inv.rejectedCitations.length > 0 && (
            <p class="muted">{inv.rejectedCitations.length} quote(s) rejected: not found in any notice.</p>
          )}
          {inv.unexplained.length > 0 && <p>Not explained: {inv.unexplained.join("; ")}</p>}
        </section>
      )}

      {proposals.length > 0 && (
        <section>
          <h2>Fix rounds</h2>
          <table>
            <thead><tr><th>Round</th><th>Operations</th><th>Result</th></tr></thead>
            <tbody>
              {proposals.map((p) => (
                <tr>
                  <td>{p.round}</td>
                  <td><ul>{p.operations.map((op) => <li>{describeOp(op)}</li>)}</ul></td>
                  <td>
                    {p.rejectedReason
                      ? `Rejected before dry-run: ${p.rejectedReason}`
                      : p.passed
                        ? "Dry-run passed"
                        : `Dry-run failed: ${p.dryRun?.findings.map((f) => f.message).join("; ")}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h2>Invoices</h2>
        <ul>{docs.map((d) => <li><a href={`/documents/${d.id}`}>{d.blobPath.split("/").pop()}</a></li>)}</ul>
      </section>

      <section>
        <h2>Audit timeline</h2>
        <table>
          <tbody>
            {events.map((e) => (
              <tr><td class="muted nowrap">{time(e.at)}</td><td>{e.actor}</td><td>{e.action}</td><td class="muted">{short(e.details)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </Layout>
  );
};

export const DocumentPage: FC<{ doc: Doc; batch: Batch; rows: FieldRow[] }> = ({ doc, batch, rows }) => (
  <Layout title={doc.blobPath}>
    <p><a href={`/batches/${batch.id}`}>← {batch.name}</a></p>
    <h1>{doc.blobPath.split("/").pop()}</h1>
    <p class="muted">Click a row to see where the value is on the PDF. Mapping v{batch.mappingVersion ?? "-"}.</p>
    <div class="split">
      <div id="viewer" data-pdf={`/documents/${doc.id}/pdf`} data-unit={doc.unit}>
        <canvas />
        <div class="box" />
      </div>
      <table>
        <thead><tr><th>Label on the PDF</th><th>Value</th><th>Maps to</th><th>Confidence</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr data-polygon={JSON.stringify(r.polygon)}>
              <td>{r.label}</td>
              <td>{r.value}</td>
              <td>{r.field ?? <em class="muted">not mapped</em>}</td>
              <td>{r.confidence.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <script type="module" src="/public/pdf-view.js"></script>
  </Layout>
);
