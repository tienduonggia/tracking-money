import { handler, json } from "@/lib/http.ts";
import { refreshPrices } from "@/lib/prices.ts";
import { depositsDueWithin } from "@/lib/repo.ts";
import { days, dstr, expGross, fd, moneyS, pd, today } from "@/lib/calc.ts";
import { escapeHtml, sendMessage } from "@/lib/telegram.ts";
import { allowedIds } from "@/lib/auth.ts";

export const maxDuration = 60;

/**
 * Vercel Cron gọi mỗi ngày 08:00 giờ VN (01:00 UTC, xem vercel.json).
 * 1) Làm mới giá coin. 2) Nhắn Telegram các sổ đáo hạn trong 3 ngày tới hoặc đã quá hạn.
 */
export const GET = handler(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "Unauthorized" }, 401);

  const result: Record<string, unknown> = {};
  try {
    result.prices = await refreshPrices();
  } catch (e) {
    result.prices = { error: (e as Error).message };
  }

  const t = today();
  const due = await depositsDueWithin(3, fd(t));
  const byOwner = new Map<number, typeof due>();
  for (const x of due) if (allowedIds().has(x.owner)) byOwner.set(x.owner, [...(byOwner.get(x.owner) || []), x]);

  const appUrl = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
  let sent = 0;
  const errors: string[] = [];
  for (const [owner, items] of byOwner) {
    const lines = items.map(({ deposit: d }) => {
      const left = days(t, pd(d.maturityDate));
      const when = left < 0 ? `quá hạn ${-left} ngày` : left === 0 ? "đáo hạn hôm nay" : `còn ${left} ngày`;
      return `• <b>${escapeHtml(d.institution)}</b>${d.label ? " · " + escapeHtml(d.label) : ""}: ${moneyS(d.principal)}, ${when} (${dstr(d.maturityDate)}), lãi dự kiến ${moneyS(expGross(d))}`;
    });
    try {
      await sendMessage(owner, `<b>Sổ tiết kiệm sắp đáo hạn</b>\n${lines.join("\n")}`, appUrl);
      sent++;
    } catch (e) {
      errors.push(`${owner}: ${(e as Error).message}`);
    }
  }
  return json({ ...result, reminders: { owners: byOwner.size, sent, errors } });
});
