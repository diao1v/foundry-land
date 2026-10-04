# Architecture: the Azure services and how they connect

The system is one application plus a set of Azure services. The application does the orchestration in
plain code; each Azure service does one job.

## The services

- **Azure Container Apps** runs the application: a Node.js server (Hono) that serves both the JSON API and
  the React web app. It runs as a single copy (one replica), because the lock that stops two people
  approving the same batch at once lives in memory.
- **Blob Storage** holds the invoice PDFs and the clinic notices. A batch is a folder of PDFs plus a
  `batch.json` file written last, which marks the batch as complete.
- **Event Grid** watches Blob Storage. When a `batch.json` file is created, it pushes an event to the
  application's webhook. It retries if the application is down, and the application ignores repeated
  deliveries of the same batch.
- **Document Intelligence** reads each PDF with its layout model. The application submits the PDF, then
  polls until the result is ready. The result has labels, values, a confidence score per value, the line
  item table, and where each value sits on the page.
- **PostgreSQL** stores batches, the values read from each PDF, the loaded invoices, every mapping version,
  incidents, fix proposals and the audit trail.
- **Azure AI Foundry** hosts three agents (prompt agents on a small GPT model): the drift analyst, the
  investigator and the fix proposer. The application calls them through the Foundry Responses API.
- **AI Search** holds the clinic notices. The investigator searches them through Foundry's built-in search
  tool, so Foundry makes that call, not the application.
- **Logic Apps** sends the review email. The application posts the batch number and a link to the Logic
  App's HTTP trigger, and the Logic App sends the email through an Outlook connector. This is the low-code
  part of the system.
- **Application Insights** receives traces from the application (OpenTelemetry) and from Foundry (each
  agent run, its input, output and token use).

## How they connect

1. Invoices are uploaded through the web app, or dropped into storage by another system.
2. Blob Storage → Event Grid → the application's webhook: an event says a batch is complete.
3. The application → Document Intelligence: read each PDF.
4. The application → PostgreSQL: map, check, and store, or open an incident.
5. The application → Foundry: run the agents when a check fails. Foundry → AI Search: the investigator
   searches the notices.
6. The application → Logic App → email: a batch waits for review.
7. A person → the web app: review and approve.

## Security

- **No keys in the application.** It signs in to Azure with its own managed identity and has one narrow
  role per service: Storage Blob Data Contributor, Cognitive Services User, Search Index Data Reader and
  Foundry User.
- Secrets that must exist (the database password, the event key, the email trigger address) are stored as
  Container Apps secrets, never in code.
- The web app is protected by a shared password. The Event Grid webhook uses its own secret key instead.
- Deployments from GitHub Actions sign in with OIDC (a federated credential), so no deploy password is
  stored. That identity may only change this one resource group.
