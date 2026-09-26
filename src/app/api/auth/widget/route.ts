import { handler, readJson } from "@/lib/http.ts";
import { verifyLoginWidget } from "@/lib/telegram-verify.ts";
import { finishLogin } from "../login.ts";

/** Đăng nhập trên website bằng Telegram Login Widget. */
export const POST = handler(async (req) => {
  const data = await readJson<Record<string, unknown>>(req);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Thiếu TELEGRAM_BOT_TOKEN");
  return finishLogin(verifyLoginWidget(data, token));
});
