CREATE TABLE "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trace_id" text,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"state" text DEFAULT 'RECEIVED' NOT NULL,
	"mapping_version" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "batches_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"blob_path" text NOT NULL,
	"page_width" real NOT NULL,
	"page_height" real NOT NULL,
	"unit" text NOT NULL,
	"line_items_total" double precision
);
--> statement-breakpoint
CREATE TABLE "extracted_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"confidence" real NOT NULL,
	"page" integer NOT NULL,
	"polygon" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fix_proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"incident_id" integer NOT NULL,
	"round" integer NOT NULL,
	"operations" jsonb NOT NULL,
	"reasoning" text NOT NULL,
	"base_version" integer NOT NULL,
	"dry_run" jsonb,
	"passed" boolean DEFAULT false NOT NULL,
	"rejected_reason" text
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"check_report" jsonb NOT NULL,
	"code_severity" text NOT NULL,
	"final_severity" text,
	"drift" jsonb,
	"investigation" jsonb,
	CONSTRAINT "incidents_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_no" text NOT NULL,
	"invoice_no" text NOT NULL,
	"invoice_date" text,
	"service_date" text,
	"patient_name" text,
	"member_no" text,
	"total" double precision NOT NULL,
	"gst" double precision,
	"batch_id" integer,
	"mapping_version" integer,
	CONSTRAINT "invoices_provider_no_invoice_no_unique" UNIQUE("provider_no","invoice_no")
);
--> statement-breakpoint
CREATE TABLE "mapping_versions" (
	"version" integer PRIMARY KEY NOT NULL,
	"mapping" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_fields" ADD CONSTRAINT "extracted_fields_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fix_proposals" ADD CONSTRAINT "fix_proposals_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE no action;