# How a batch flows

A batch is a set of invoices from one provider, arriving together. This is what happens to it, step by step.

## Arriving

There are two ways in. A person can upload PDFs in the web app, or another system can drop them into Blob
Storage. Either way the PDFs are stored first and a `batch.json` file last. Event Grid sees that file and
tells the application. A batch is started only once, even if the event arrives twice.

## The happy route

1. **Read.** Document Intelligence reads every PDF: labels, values, confidence, and the line item table.
2. **Map.** The current mapping version turns the printed labels into fields, for example "Provider No."
   into the field provider_no. The mapping is data stored in the database, not code.
3. **Check.** Code runs exact checks on every invoice:
   - every required field is there;
   - the values were read with enough confidence;
   - the totals add up;
   - each procedure's fee is within 5 % of the median fee this provider charged for the same procedure
     before (only for procedures with at least 3 earlier fees).
4. **Store.** If every check passes, the invoices are stored. This takes about 20 seconds and uses no AI.

## When a check fails

An incident is opened and the agents look at it (see "The agents and the guardrails around them"). If they
find a fix that passes a dry run, the batch waits for review and a reviewer gets an email with a link.

The reviewer sees the evidence: what failed, what changed, the quote from the provider's notice, the
proposed change, the dry run result, and each PDF next to the values read from it.

- **Approve:** code checks again, saves the change as a new mapping version (version 2, 3, …), and stores
  the batch with it. Old versions never change, so a change can be rolled back.
- **Reject:** nothing is stored.

If a notice announced a new price and that explains everything, there is nothing to fix. The reviewer can
approve loading the batch as it is, with no new mapping version.

The next batch from the same provider uses the new mapping version, passes the checks and is stored with no
agents and no person.

## States

Every batch moves through fixed states, and only allowed moves are possible:

- RECEIVED → EXTRACTED → MAPPED → CHECKED → LOADED (the happy route)
- CHECKED → INCIDENT_OPEN → ANALYSED → INVESTIGATED → PROPOSED → DRY_RUN → AWAITING_REVIEW
- AWAITING_REVIEW → RELOADED (approved) or CLOSED (rejected)
- Any agent or reading failure → ESCALATED: a person takes over and nothing is stored.

## Audit trail

Every step writes an audit entry: who did it (code, which agent, or which person), what happened, and when.
The web app shows it as a timeline for each batch.
