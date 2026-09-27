import { handler, json, requireSession } from "@/lib/http.ts";
import { listVangToday } from "@/lib/prices.ts";

/** Danh sách mã giá vàng vang.today đang trả về, để chọn đúng mã. */
export const GET = handler(async (req) => {
  await requireSession(req);
  try {
    return json(await listVangToday());
  } catch (e) {
    return json({ error: `Không lấy được danh sách từ vang.today: ${(e as Error).message}` }, 502);
  }
});
