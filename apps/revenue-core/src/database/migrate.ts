import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: databaseUrl });
  const sql = await readFile(join(__dirname, "migrations", "001_initial.sql"), "utf8");
  const retryableCodes = new Set(["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "57P03"]);

  try {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      try {
        await pool.query(sql);
        process.stdout.write("Database migration complete\n");
        return;
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (!retryableCodes.has(code) || attempt === 20) throw error;
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
