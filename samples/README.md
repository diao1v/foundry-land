# Sample batches

Four batches of fictional invoices from a made-up dental clinic, Example Dental Care Ltd. Drop the five PDFs
of a batch onto the web app (or "choose files") to start it. Run them in order:

1. **`1-normal`**: the usual layout. Every check passes and the batch is stored. No AI is used.
2. **`2-shifted`**: the clinic's new layout. "Provider No." is now "Provider ID", and totals and fees leave out
   GST, so every fee is 13 % lower than usual. The checks stop it, the three agents find out what changed and
   why (the clinic's notice), propose a mapping fix and test it. It then waits for a person to approve.
3. **`3-healed`**: the new layout again, after the fix was approved. It is stored with no agents and no person.
4. **`4-price`**: the new layout with a price rise for extractions from 1 November 2026, which the clinic
   announced. The agents find the notice, code checks the quote, the new fee and the date, and the batch is
   stored without a person.

Batches 3 and 4 behave as described only after batch 2 has been approved (they need the new mapping). On a
shared demo the batches may already have been run, so the result can differ from a fresh start.

All names, numbers and invoices here are fictional.
