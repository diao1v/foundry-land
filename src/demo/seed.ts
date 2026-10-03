import { eq, gt, isNotNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { batches, invoices, mappingVersions } from "../db/schema";
import { Mapping } from "../mapping/mapping";
import v1 from "../../mappings/v1.json";
import { historyInvoices, PROVIDER } from "./invoice-data";

export async function seedMapping(db: Db) {
  await db
    .insert(mappingVersions)
    .values({ version: 1, mapping: Mapping.parse(v1), createdBy: "system", reason: "initial mapping" })
    .onConflictDoNothing();
}

export async function seedHistory(db: Db) {
  await db
    .insert(invoices)
    .values(
      historyInvoices().map((inv) => ({
        providerNo: PROVIDER.providerNo,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.date,
        serviceDate: inv.date,
        total: inv.total,
        batchId: null,
        mappingVersion: 1,
        lineItems: inv.lines.map((l) => ({ description: l.desc, fee: l.fee })), // v1 fees include GST
      })),
    )
    // fills line items on history rows seeded before they existed
    .onConflictDoUpdate({ target: [invoices.providerNo, invoices.invoiceNo], set: { lineItems: sql`excluded.line_items` } });
}

// Back to the start of the demo: no batches, mapping v1 only, seeded history kept.
export async function resetDemo(db: Db) {
  await db.delete(invoices).where(isNotNull(invoices.batchId));
  await db.delete(batches); // cascades to documents, fields, incidents, proposals, audit events
  await db.delete(mappingVersions).where(gt(mappingVersions.version, 1));
  // v1 follows mappings/v1.json, so calibration edits (e.g. "ignore") reach an already-seeded database
  await db.update(mappingVersions).set({ mapping: Mapping.parse(v1) }).where(eq(mappingVersions.version, 1));
}
