import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Link, useNavigate } from "react-router";
import { type BatchDetail, postJson, postJsonFor, REVIEWER } from "@/lib/api";
import { clock, money, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DecisionCard({ d, onDone }: { d: BatchDetail; onDone(): void }) {
  const [pending, setPending] = useState<"approve" | "reject" | "rerun">();
  const navigate = useNavigate();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const dec = d.decision;

  const act = async (kind: "approve" | "reject") => {
    setPending(kind);
    setError(undefined);
    try {
      await postJson(`/api/batches/${d.batch.id}/${kind}`, kind === "approve" ? { reviewer: REVIEWER } : { reviewer: REVIEWER, reason });
      // keep the button disabled: the refetched batch replaces this card
    } catch (e) {
      setError((e as Error).message);
      setPending(undefined);
    }
    onDone(); // refetch either way: after a 409 the batch may already be approved in another tab
  };

  // Run the pipeline again on the same PDFs as a new batch; this one is closed and keeps its evidence
  const runAgain = async () => {
    setPending("rerun");
    setError(undefined);
    try {
      const r = await postJsonFor<{ id: number }>(`/api/batches/${d.batch.id}/rerun`, { reviewer: REVIEWER });
      navigate(`/batches/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
      setPending(undefined);
      onDone();
    }
  };

  const reject = (
    <>
      {rejecting ? (
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void act("reject"); }}>
          <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="h-9 bg-white" />
          <Button type="submit" variant="outline" className="h-9" disabled={!reason.trim() || !!pending}>
            {pending === "reject" ? "Rejecting…" : "Reject"}
          </Button>
        </form>
      ) : (
        <Button variant="outline" className="h-9 px-4 font-semibold" onClick={() => setRejecting(true)} disabled={!!pending}>Reject</Button>
      )}
    </>
  );

  return (
    <Card
      className={cn(
        "sticky top-6 gap-0 px-5 py-4",
        dec.state === "waiting" && "border-t-[3px] border-t-coral",
        dec.state === "approved" && "border-t-[3px] border-t-ok",
        dec.state === "todo" && "border-dashed bg-transparent shadow-none",
      )}
    >
      <h4 className="mb-3 text-[13px] font-semibold">
        {dec.state === "approved" || dec.state === "rejected" || dec.state === "rerun" ? "Done" : dec.state === "escalated" ? "Needs a person" : "Your decision"}
      </h4>

      {dec.state === "waiting" && dec.proposal && (
        <>
          <p className="mb-1 text-xs text-muted-foreground">Proposed change · dry-run passed in round {dec.proposal.round}</p>
          <ul className="mb-3">
            {dec.proposal.described.map((t) => (
              <li key={t} className="border-b border-[#EEF1F5] py-2 text-[13px] last:border-0">{t}</li>
            ))}
          </ul>
          <p className="mb-4 text-xs text-muted-foreground">Dry-run: all checks pass · average {money(dec.proposal.dryRunAvg)}</p>
          <div className="flex flex-wrap gap-2">
            <Button className="h-9 bg-coral px-4 font-semibold text-white hover:bg-coral/90" onClick={() => void act("approve")} disabled={!!pending}>
              {pending === "approve" ? "Reloading…" : "Approve and reload"}
            </Button>
            {!rejecting && reject}
          </div>
          {rejecting && reject}
        </>
      )}

      {dec.state === "waiting" && dec.loadAsIs && (
        <>
          <p className="mb-1 text-xs font-semibold text-ok">Load as is — price change announced</p>
          <ul className="mb-3">
            {dec.loadAsIs.map((c) => (
              <li key={c.procedure} className="border-b border-[#EEF1F5] py-2 text-[13px] last:border-0">
                {c.procedure} <span className="font-mono">{money(c.historyFee)} → {money(c.fee)}</span>{" "}
                <span className="text-muted-foreground">({pct((c.fee - c.historyFee) / c.historyFee)})</span>
              </li>
            ))}
          </ul>
          <p className="mb-4 text-xs text-muted-foreground">The clinic announced this price. No mapping change is needed.</p>
          <div className="flex flex-wrap gap-2">
            <Button className="h-9 bg-coral px-4 font-semibold text-white hover:bg-coral/90" onClick={() => void act("approve")} disabled={!!pending}>
              {pending === "approve" ? "Loading…" : "Approve and load"}
            </Button>
            {!rejecting && reject}
          </div>
          {rejecting && reject}
        </>
      )}

      {dec.state === "todo" && (
        <p className="text-[13px] text-muted-foreground">
          <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-coral" />
          No decision yet. Nothing is loaded until a person approves.
        </p>
      )}

      {dec.state === "not_needed" && !dec.loadAsIs && <p className="text-[13px] text-muted-foreground">Loaded automatically. All checks passed, so no decision was needed.</p>}

      {dec.state === "not_needed" && dec.loadAsIs && (
        <>
          <p className="mb-1 text-xs font-semibold text-ok">Loaded automatically — price change announced</p>
          <ul className="mb-3">
            {dec.loadAsIs.map((c) => (
              <li key={c.procedure} className="border-b border-[#EEF1F5] py-2 text-[13px] last:border-0">
                {c.procedure} <span className="font-mono">{money(c.historyFee)} → {money(c.fee)}</span>{" "}
                <span className="text-muted-foreground">({pct((c.fee - c.historyFee) / c.historyFee)}){c.from && ` from ${c.from}`}</span>
                <p className="mt-1 text-[12.5px] text-muted-foreground italic">“{c.quote}”</p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            The clinic announced this price. Code checked the quote, the new fee and the start date, so no person was needed.
          </p>
        </>
      )}

      {dec.state === "approved" && dec.result && (
        <p className="text-[13px] text-muted-foreground">
          Approved by <b className="text-foreground">{dec.by}</b>{dec.at && ` at ${clock(dec.at)}`}.{" "}
          {dec.loadAsIs ? `Loaded as is with mapping v${dec.result.to}; no mapping change was needed.` : `Reloaded with mapping v${dec.result.to}; v${dec.result.from} is kept unchanged.`}{" "}
          Average total {money(dec.result.avgTotal)}{dec.result.changeVsHistory != null && ` (${pct(dec.result.changeVsHistory)} vs history)`}.
        </p>
      )}

      {dec.state === "rejected" && (
        <p className="text-[13px] text-muted-foreground">
          Rejected by <b className="text-foreground">{dec.by}</b>{dec.at && ` at ${clock(dec.at)}`}: “{dec.reason}”. Nothing was loaded.
        </p>
      )}

      {dec.state === "escalated" && (
        <>
          <p className="mb-4 text-[13px] text-muted-foreground">{dec.reason}. No verified fix, so a person must look at it.</p>
          {reject}
        </>
      )}

      {dec.state === "rerun" && dec.rerunAs && (
        <p className="text-[13px] text-muted-foreground">
          Run again by <b className="text-foreground">{dec.by}</b>{dec.at && ` at ${clock(dec.at)}`} as{" "}
          <Link to={`/batches/${dec.rerunAs.id}`} className="font-semibold text-foreground underline-offset-4 hover:underline">{dec.rerunAs.name}</Link>.
          Nothing was loaded from this batch.
        </p>
      )}

      {(dec.state === "waiting" || dec.state === "escalated") && (
        <div className="mt-4 border-t border-[#EEF1F5] pt-3 text-xs text-muted-foreground">
          Something looks wrong?{" "}
          <button type="button" onClick={() => void runAgain()} disabled={!!pending} className="font-semibold text-foreground underline-offset-4 hover:underline disabled:opacity-50">
            {pending === "rerun" ? "Starting…" : "Run again"}
          </button>{" "}
          on the same PDFs as a new batch.
        </div>
      )}

      {error && (dec.state === "waiting" || dec.state === "escalated") && (
        <p className="mt-3 rounded-md bg-coral-soft px-3 py-2 text-[12.5px] text-coral-ink">{error}</p>
      )}
    </Card>
  );
}
