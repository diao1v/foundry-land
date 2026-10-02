import { drizzle } from "drizzle-orm/node-postgres"; // node-postgres: OpenTelemetry traces `pg` queries
import pg from "pg";
import * as schema from "./schema";

export const makeDb = (url: string) => drizzle(new pg.Pool({ connectionString: url }), { schema });
export type Db = ReturnType<typeof makeDb>;
