# Limits and what production would need

foundry-land is a demo. These are its known limits and what a production version would change.

## Limits today

- **The whole batch is held.** If one invoice in a batch fails a check, the whole batch waits for review.
- **One provider.** The demo has a single fictional dental clinic.
- **A shared password.** The web app is protected by one shared password, not personal sign-in.
- **Personal data reaches the agents.** The agents see a few sample values per label, which can include
  patient names and member numbers (all fictional in the demo).
- **One replica.** The approval lock is in memory, so the app runs as a single copy.
- **Infrastructure by scripts.** The Azure resources are created by scripts, not by infrastructure as code.

## What production would change

- Store the invoices that pass and hold only the changed ones.
- Run checks and keep history per provider, for many providers.
- Real sign-in for reviewers, with roles.
- Mask names and member numbers before any agent sees them, and do a privacy review.
- A database lock for approvals, so the app can run as several copies.
- Infrastructure as code for every Azure resource.
- Fixed test cases for the agents, run before every prompt change.

## Cost

- Normal batches use no AI.
- A batch that fails a check makes three agent calls, plus at most three fix rounds, on one small model.
- Document Intelligence is charged per page; AI Search runs on a small tier; the database is the smallest
  size.
- A monthly budget alert watches the total.

## Reliability

- Every Azure call has a timeout and retries.
- If an agent or Azure service fails, the batch goes to a person and nothing is stored.
- Tracing in Application Insights shows where time goes and where failures happen, including inside the
  agents.
