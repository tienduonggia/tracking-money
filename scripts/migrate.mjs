// Chạy: DATABASE_URL=... node scripts/migrate.mjs
import { readFile } from "node:fs/promises";
import postgres from "postgres";

// Ưu tiên kết nối trực tiếp (không qua pooler) cho DDL nếu có — Neon trên Vercel cung cấp DATABASE_URL_UNPOOLED
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] Thiếu DATABASE_URL — chưa gắn database cho project?");
  process.exit(1);
}
const host = (() => { try { return new URL(url).host; } catch { return "?"; } })();
console.log(`[migrate] Áp dụng schema lên ${host}`);
const sql = postgres(url, { max: 1, onnotice: () => {} });
const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
await sql.unsafe(schema);
const tables = await sql`select table_name from information_schema.tables where table_schema = current_schema() and table_name in ('deposits','holdings','login_codes','flex_accounts') order by 1`;
console.log(`[migrate] OK — bảng hiện có: ${tables.map((t) => t.table_name).join(", ")}`);
await sql.end();
