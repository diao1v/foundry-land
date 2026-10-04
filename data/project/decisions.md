# Design decisions and why

These are the main choices in foundry-land and the reasons for them.

## AI only when a check fails

Exact checks in code are free, fast and always give the same answer. AI is used only for what rules can't
do: telling a rename from a new field, reading a provider's letter, and writing a fix. Normal batches never
call an agent, so they cost nothing extra.

## Code verifies, agents suggest

Checks, quote checking and the dry run are code. Agents produce suggestions; code decides whether those
suggestions are true and safe; a person approves. This is the main safety idea in the system.

## A fee check per procedure, not a batch average

An earlier version compared the batch's average total with history. That depends on the mix of procedures
in the batch, so it can raise false alarms or miss real changes. Comparing each procedure's fee with the
same procedure's history is like for like. It is what catches the quiet GST change: every procedure is about
13 % lower.

## Versioned mappings

The mapping from labels to fields is data, stored in the database with a version number. An approved fix
creates a new version; old versions never change. This makes every change reviewable and reversible.

## Azure AI Foundry for the agents

Foundry hosts the agents with versions, built-in tools (the AI Search tool used by the investigator) and
tracing. The orchestration stays in plain code, so the flow is easy to test and doesn't depend on a
workflow product.

## Schema in the prompt instead of Foundry's built-in JSON output

Each agent's prompt includes the JSON schema of its reply, and code checks every reply against it. Foundry's
built-in structured output was not used because it had not been tested enough for this setup.

## Skills kept in the prompt

The drift analyst's guidance ("skills" such as detect-rename) lives in its instructions. Foundry Skills were
in preview and not supported for this kind of agent, so they were left for later rather than built into a
live demo.

## Low-code where it's simple

The review email is a Logic App: an HTTP trigger and an email step. It needs no code and is easy to change.

## One replica

The lock that stops two approvals of the same batch is in memory, so the app runs as one copy. A database
lock would allow more copies; one copy is enough for a demo.
