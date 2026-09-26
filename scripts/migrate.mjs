// Chạy: DATABASE_URL=... node scripts/migrate.mjs
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Thiếu DATABASE_URL");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
await sql.unsafe(schema);
console.log("Đã áp dụng db/schema.sql");
await sql.end();
