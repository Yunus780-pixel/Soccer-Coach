import { defineConfig } from "drizzle-kit";
import path from "path";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const schema = path.join(__dirname, "./src/schema/index.ts");

export default databaseUrl.startsWith("pglite://")
  ? defineConfig({
      schema,
      dialect: "postgresql",
      driver: "pglite",
      dbCredentials: {
        url: databaseUrl.slice("pglite://".length),
      },
    })
  : defineConfig({
      schema,
      dialect: "postgresql",
      dbCredentials: {
        url: databaseUrl,
      },
    });
