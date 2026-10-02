import { makeDb } from "../src/db/client";
import { seedHistory, seedMapping } from "../src/demo/seed";

const db = makeDb(process.env.DATABASE_URL!);
await seedMapping(db);
await seedHistory(db);
console.log("seeded mapping v1 and 60 history invoices");
await db.$client.end();
