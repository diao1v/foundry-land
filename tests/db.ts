import { sql } from "drizzle-orm";
import { makeDb } from "../src/db/client";
import { seedMapping } from "../src/demo/seed";

export const db = makeDb(process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/foundry_land_test");

export async function resetDb() {
  await db.execute(
    sql`truncate audit_events, fix_proposals, incidents, extracted_fields, documents, invoices, batches, mapping_versions restart identity cascade`,
  );
  await seedMapping(db);
}
