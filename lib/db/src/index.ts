import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

let pool: pg.Pool | null = null;
let db: NodePgDatabase<typeof schema>;

if (databaseUrl.startsWith("pglite://")) {
  // Local development mode: embedded Postgres (PGlite) stored in a folder,
  // no database server required. e.g. DATABASE_URL=pglite:///abs/path/to/data
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const client = new PGlite(databaseUrl.slice("pglite://".length));
  db = drizzlePglite(client, { schema }) as unknown as NodePgDatabase<
    typeof schema
  >;
} else {
  pool = new Pool({ connectionString: databaseUrl });
  db = drizzle(pool, { schema });
}

export { pool, db };

export * from "./schema";
