import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: databaseUrl });
  const directory = join(__dirname, "migrations");
  const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  const sql = (await Promise.all(files.map((name) => readFile(join(directory, name), "utf8")))).join("\n");
  const retryableCodes = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "57P03"]);

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
