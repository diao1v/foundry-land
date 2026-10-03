import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type BatchDetail, postJson, REVIEWER } from "@/lib/api";
import { clock, money, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DecisionCard({ d, onDone }: { d: BatchDetail; onDone(): void }) {
  const [pending, setPending] = useState<"approve" | "reject">();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const dec = d.decision;

  const act = async (kind: "approve" | "reject") => {
    setPending(kind);
    setError(undefined);
    try {
      await postJson(`/api/batches/${d.batch.id}/${kind}`, kind === "approve" ? { reviewer: REVIEWER } : { reviewer: REVIEWER, reason });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(undefined);
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
        {dec.state === "approved" || dec.state === "rejected" ? "Done" : dec.state === "escalated" ? "Needs a person" : "Your decision"}
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

      {dec.state === "todo" && (
        <p className="text-[13px] text-muted-foreground">
          <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-coral" />
          No decision yet. Nothing is loaded until a person approves.
        </p>
      )}

      {dec.state === "not_needed" && <p className="text-[13px] text-muted-foreground">Loaded automatically. All checks passed, so no decision was needed.</p>}

      {dec.state === "approved" && dec.result && (
        <p className="text-[13px] text-muted-foreground">
          Approved by <b className="text-foreground">{dec.by}</b>{dec.at && ` at ${clock(dec.at)}`}. Reloaded with mapping v{dec.result.to}; v{dec.result.from} is kept unchanged.
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

      {error && <p className="mt-3 rounded-md bg-coral-soft px-3 py-2 text-[12.5px] text-coral-ink">{error}</p>}
    </Card>
  );
}
