import "server-only";
import { allowedIds, issueToken } from "@/lib/auth.ts";
import { json } from "@/lib/http.ts";
import type { TgUser } from "@/lib/telegram-verify.ts";

/** Sau khi Telegram xác thực xong: kiểm tra allowlist rồi cấp token. */
export async function finishLogin(u: TgUser | null) {
  if (!u) return json({ error: "Dữ liệu đăng nhập Telegram không hợp lệ hoặc đã hết hạn" }, 401);
  if (!allowedIds().has(u.id)) {
    return json(
      { error: `Tài khoản Telegram này chưa được phép. Thêm ${u.id} vào ALLOWED_TELEGRAM_IDS rồi deploy lại.`, telegramId: u.id },
      403,
    );
  }
  const token = await issueToken(u);
  return json({ token, user: { id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "" } });
}
