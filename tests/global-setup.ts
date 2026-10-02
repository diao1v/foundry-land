import { migrateDb } from "../src/db/migrate";

export default async function () {
  await migrateDb(process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/foundry_land_test");
}
