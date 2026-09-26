import { handler, json } from "@/lib/http.ts";
import { sql } from "@/lib/db.ts";
import { allowedIds } from "@/lib/auth.ts";

/**
 * Kiểm tra cấu hình (không lộ giá trị bí mật). Mở: https://<domain>/api/health
 */
export const GET = handler(async (req) => {
  const env = (k: string) => Boolean(process.env[k]);
  const host = new URL(req.url).host;
  const out: Record<string, unknown> = {
    host,
    env: {
      DATABASE_URL: env("DATABASE_URL"),
      TELEGRAM_BOT_TOKEN: env("TELEGRAM_BOT_TOKEN"),
      NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || null,
      ALLOWED_TELEGRAM_IDS_count: allowedIds().size,
      SESSION_SECRET_ok: (process.env.SESSION_SECRET || "").length >= 32,
      CRON_SECRET: env("CRON_SECRET"),
    },
  };
  try {
    const r = await sql()`select count(*)::int as n from information_schema.tables where table_name in ('deposits','holdings')`;
    out.db = r[0].n === 2 ? "ok" : "thiếu bảng — chạy npm run db:migrate";
  } catch (e) {
    out.db = `lỗi: ${(e as Error).message}`;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(8000) });
      const b = (await r.json()) as { ok: boolean; result?: { username: string } };
      const actual = b.result?.username ?? null;
      const configured = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");
      out.bot = {
        tokenValid: b.ok,
        usernameFromToken: actual,
        usernameMatchesEnv: !!actual && actual.toLowerCase() === configured.toLowerCase(),
        hint: `BotFather /setdomain cho @${actual ?? "?"} phải là đúng: ${host}`,
      };
    } catch (e) {
      out.bot = { error: (e as Error).message };
    }
  }
  return json(out);
});
