import { handler, readJson, HttpError } from "@/lib/http.ts";
import { verifyWebAppInitData } from "@/lib/telegram-verify.ts";
import { finishLogin } from "../login.ts";

/** Đăng nhập từ Telegram Mini App: client gửi window.Telegram.WebApp.initData */
export const POST = handler(async (req) => {
  const { initData } = await readJson<{ initData?: string }>(req);
  if (!initData) throw new HttpError(400, "Thiếu initData");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Thiếu TELEGRAM_BOT_TOKEN");
  return finishLogin(verifyWebAppInitData(initData, token));
});
