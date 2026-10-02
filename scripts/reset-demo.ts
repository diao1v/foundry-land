import { makeDb } from "../src/db/client";
import { resetDemo } from "../src/demo/seed";

const db = makeDb(process.env.DATABASE_URL!);
await resetDemo(db);
console.log("demo reset: batches removed, mapping back to v1");
await db.$client.end();
