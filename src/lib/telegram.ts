import "server-only";

/** Gửi tin nhắn qua Bot API. chat_id = Telegram user id (người dùng phải từng bấm Start với bot). */
export async function sendMessage(chatId: number, text: string, openUrl?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Thiếu TELEGRAM_BOT_TOKEN");
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (openUrl) body.reply_markup = { inline_keyboard: [[{ text: "Mở Sổ Tài Sản", web_app: { url: openUrl } }]] };
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage lỗi ${res.status}: ${await res.text()}`);
}

export const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
