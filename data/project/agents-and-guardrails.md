# The agents and the guardrails around them

Three agents in Azure AI Foundry handle a batch only when a check fails. Each has one job. Agents cannot
change anything; they only suggest. Code checks every suggestion, and a person approves every change.

## The three agents

- **Drift analyst: what changed?** It reads the check report and sample values, and names each change:
  a renamed label, a new field, a change in meaning, a price change, or noise. It also rates how serious
  it is. It can raise the severity code gave, but never lower it.
- **Investigator: why did it change?** It searches the provider's notices in AI Search and answers with
  quotes. Code checks that every quote appears word for word in the notice it cites. A quote that isn't
  there is thrown out. For a price change, the quote must also name the procedure and the new fee.
- **Fix proposer: how do we fix it?** It proposes up to 5 changes to the mapping, using only three kinds of
  operation: accept another label for a field, add a new field, or compute a field from other fields (for
  example total = total + GST).

## The dry run

Code applies the proposed change to a copy of the mapping and runs every check again on the whole batch.
Nothing is stored. If the checks pass, the batch waits for a person. If they fail, the fix proposer gets
the failures and tries again. After at most 3 rounds without a pass, a person is told.

## When an agent fails

- Every agent reply must match a fixed schema. If it doesn't, the agent is asked once more with the error.
  If it still doesn't, the batch goes to a person.
- If an agent reports its own failure, for example when the search tool is briefly unavailable, the
  application waits a few seconds and asks again, up to 3 times.
- Network errors and timeouts are retried a few times.
- When anything still fails, the batch is escalated to a person. It never loads by itself.

## Why this keeps the AI honest

- AI only runs when a check fails, so normal batches use no AI.
- Agents can't act, only suggest.
- Quotes are checked word for word, so a made-up explanation doesn't reach the reviewer.
- Every fix is tested on the real batch before anyone sees it.
- A person approves every change, and the audit trail records each agent's output.

## Seeing what the agents did

Each agent's output is stored with the incident and shown in the web app. Foundry tracing, connected to
Application Insights, shows every agent run: the instructions, the input, the reply and the token use.
