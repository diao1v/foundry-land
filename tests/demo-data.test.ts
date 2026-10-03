import { expect, it } from "vitest";
import { BATCHES } from "../src/demo/invoice-data";
import { invoiceHtml } from "../src/demo/invoice-html";
import { LETTER_ID, loadLocalNotices } from "../src/demo/notices";

it("renders every label, the Fee table and the fictional note", () => {
  const [v1] = BATCHES.demo();
  const v2 = BATCHES.demo()[2];
  const h1 = invoiceHtml(v1);
  const h2 = invoiceHtml(v2);
  for (const [label, value] of [...v1.fields]) expect(h1).toContain(`<b>${label}:</b> ${value}`);
  for (const [label, value] of [...v2.fields]) expect(h2).toContain(`<b>${label}:</b> ${value}`);
  expect(h1).toContain("<th>Fee</th>");
  expect(h1).toContain("Fictional invoice");
  expect(h1).not.toContain("GST:</b>");
});

it("loads 6 notices with the provider letter", () => {
  const notices = loadLocalNotices();
  expect(notices).toHaveLength(6);
  const letter = notices.find((n) => n.id === LETTER_ID)!;
  expect(letter.title).toBe("Example Dental Care Ltd — changes to our invoices");
  expect(letter.content).toContain("First, invoice totals will exclude GST.");
});
