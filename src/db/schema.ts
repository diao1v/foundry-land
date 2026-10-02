import { boolean, doublePrecision, integer, jsonb, pgTable, real, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import type { DriftReport, VerifiedInvestigation } from "../agents/schemas";
import type { CheckReport, Severity } from "../checks";
import type { FixOp } from "../fix";
import type { Mapping } from "../mapping/mapping";
import type { BatchState } from "../state";

export const batches = pgTable("batches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // blob folder; unique = duplicate events are ignored
  state: text("state").$type<BatchState>().notNull().default("RECEIVED"),
  mappingVersion: integer("mapping_version"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => batches.id, { onDelete: "cascade" }),
  blobPath: text("blob_path").notNull(),
  pageWidth: real("page_width").notNull(),
  pageHeight: real("page_height").notNull(),
  unit: text("unit").notNull(), // "inch" for PDFs
  lineItemsTotal: doublePrecision("line_items_total"),
});

export const extractedFields = pgTable("extracted_fields", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  value: text("value").notNull(),
  confidence: real("confidence").notNull(),
  page: integer("page").notNull(),
  polygon: jsonb("polygon").$type<number[]>().notNull(), // [x1,y1,…,x4,y4] in page units
});

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    providerNo: text("provider_no").notNull(),
    invoiceNo: text("invoice_no").notNull(),
    invoiceDate: text("invoice_date"),
    serviceDate: text("service_date"),
    patientName: text("patient_name"),
    memberNo: text("member_no"),
    total: doublePrecision("total").notNull(), // GST-inclusive
    gst: doublePrecision("gst"),
    batchId: integer("batch_id").references(() => batches.id, { onDelete: "set null" }), // null = seeded history
    mappingVersion: integer("mapping_version"),
  },
  (t) => [unique().on(t.providerNo, t.invoiceNo)],
);

export const mappingVersions = pgTable("mapping_versions", {
  version: integer("version").primaryKey(), // immutable; current = highest
  mapping: jsonb("mapping").$type<Mapping>().notNull(),
  createdBy: text("created_by").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const incidents = pgTable("incidents", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().unique().references(() => batches.id, { onDelete: "cascade" }),
  checkReport: jsonb("check_report").$type<CheckReport>().notNull(),
  codeSeverity: text("code_severity").$type<Severity>().notNull(),
  finalSeverity: text("final_severity").$type<Severity>(),
  drift: jsonb("drift").$type<DriftReport>(),
  investigation: jsonb("investigation").$type<VerifiedInvestigation>(),
});

export const fixProposals = pgTable("fix_proposals", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
  round: integer("round").notNull(),
  operations: jsonb("operations").$type<FixOp[]>().notNull(),
  reasoning: text("reasoning").notNull(),
  baseVersion: integer("base_version").notNull(), // mapping version the dry-run used
  dryRun: jsonb("dry_run").$type<CheckReport>(),
  passed: boolean("passed").notNull().default(false),
  rejectedReason: text("rejected_reason"),
});

export const auditEvents = pgTable("audit_events", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").references(() => batches.id, { onDelete: "cascade" }),
  actor: text("actor").notNull(), // system | agent:<name> | human:<name>
  action: text("action").notNull(),
  details: jsonb("details").notNull().default({}),
  traceId: text("trace_id"),
  at: timestamp("at").defaultNow().notNull(),
});
