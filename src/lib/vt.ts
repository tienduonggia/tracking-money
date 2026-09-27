// Đọc dữ liệu vang.today (thuần, không phụ thuộc server) — dùng chung server & test.
export interface GoldQuote { code: string; name: string; buy: number; sell: number; updated: number | null }

/** Đọc mọi kiểu cấu trúc có thể gặp: data là mảng, object 1 dòng, hoặc object map theo mã. */
export function parseVangToday(body: unknown): GoldQuote[] {
  const b = (body ?? {}) as Record<string, unknown>;
  const raw = b.data ?? b.prices ?? b.result ?? body;
  let rows: Record<string, unknown>[] = [];
  if (Array.isArray(raw)) rows = raw as Record<string, unknown>[];
  else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if ("buy" in o || "type_code" in o) rows = [o];
    else rows = Object.entries(o).filter(([, v]) => v && typeof v === "object").map(([k, v]) => ({ type_code: k, ...(v as object) }));
  }
  return rows
    .map((r) => {
      const code = String(r.type_code ?? r.code ?? r.type ?? "").trim();
      const buy = Number(r.buy ?? r.buy_price ?? r.mua);
      const sell = Number(r.sell ?? r.sell_price ?? r.ban);
      const updated = Number(r.update_time ?? r.updated_at ?? 0) || null;
      return { code, name: String(r.name ?? r.type_name ?? code), buy: Number.isFinite(buy) ? buy : 0, sell: Number.isFinite(sell) ? sell : 0, updated };
    })
    .filter((q) => q.code && (q.buy > 0 || q.sell > 0));
}

