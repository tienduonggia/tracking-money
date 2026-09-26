import { handler, json, requireSession } from "@/lib/http.ts";
import { refreshPrices } from "@/lib/prices.ts";

/** Người dùng bấm "Cập nhật giá": làm mới giá coin có nguồn CoinGecko. */
export const POST = handler(async (req) => {
  const s = await requireSession(req);
  try {
    return json(await refreshPrices(s.userId));
  } catch (e) {
    return json({ error: `Không lấy được giá: ${(e as Error).message}` }, 502);
  }
});
