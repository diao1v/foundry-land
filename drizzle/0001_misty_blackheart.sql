ALTER TABLE "documents" ADD COLUMN "line_items" jsonb;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "line_items" jsonb;