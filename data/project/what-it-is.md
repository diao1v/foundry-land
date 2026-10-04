# What foundry-land is

foundry-land is a small demo of an invoice intake pipeline for a health insurer. It reads invoices from
providers, checks them, and stores the numbers. When a provider changes its invoices, the pipeline notices,
works out why, proposes a fix, tests the fix, and asks a person before anything changes.

The idea in one line: **agents suggest, code verifies, a person decides.**

## The problem

Every provider prints its own invoice layout. A pipeline maps the labels on the invoice (for example
"Provider No." or "Total") to fields in a database. When a provider changes its layout, two kinds of
failure happen:

- **Loud:** a label is renamed, so a required field is missing. The load fails and someone has to look.
- **Quiet:** the layout looks the same, but a value now means something different. Everything loads, the
  numbers are wrong, and nobody notices for weeks. Working out why takes hours.

## The demo story

All data in the demo is fictional. There is one provider, a dental clinic called Example Dental Care Ltd.
Its invoices cover a general inspection plus cleaning, an X-ray or an extraction.

The clinic agreed to send a notice whenever something about its invoices changes: the price, the format,
anything. The notices are kept and searchable.

On a normal day a batch of PDF invoices arrives, is read, mapped, checked and stored, and nobody touches it.

Then the clinic changes its invoice:

- "Provider No." is renamed to "Provider ID". This is the loud change: a required field goes missing.
- Totals and fees now exclude GST, and GST gets its own line. This is the quiet change: every fee is
  13 % lower than the clinic's history, because 1 ÷ 1.15 is about 0.87. The visit costs the same; only the
  invoice changed.

The clinic had sent a notice about both changes. The pipeline finds that notice, quotes it, proposes a
mapping change that reads the new layout, tests it on the batch, and emails a reviewer. The reviewer
approves, the batch is stored correctly, and the next batch from the clinic loads by itself.

## What it shows

- A self-healing pipeline with a person in the loop.
- AI used only where judgement is needed, and only when a check fails.
- Every AI suggestion checked by code before a person sees it.
- A full audit trail of who did what and when.
