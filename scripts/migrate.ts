import { migrateDb } from "../src/db/migrate";

await migrateDb(process.env.DATABASE_URL!);
console.log("migrated");
