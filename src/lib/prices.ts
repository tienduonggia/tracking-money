import "server-only";
import { autoMarket, setMarketPrice } from "./repo.ts";
import { parseVangToday, type GoldQuote } from "./vt.ts";
export { parseVangToday };
import { fd, today } from "./calc.ts";

/** Lấy giá VND từ CoinGecko cho danh sách coin id (bitcoin, ethereum, ...). */
export async function fetchCoinGeckoVnd(ids: string[]): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.searchParams.set("ids", [...new Set(ids)].join(","));
  url.searchParams.set("vs_currencies", "vnd");
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
  const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`CoinGecko trả về ${res.status}`);
  const body = (await res.json()) as Record<string, { vnd?: number }>;
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(body)) if (typeof v?.vnd === "number" && v.vnd > 0) out[id] = v.vnd;
  return out;
}

export { GOLD_CODES } from "./gold.ts";

/**
 * Giá vàng từ vang.today (miễn phí, không cần key): VND / lượng.
 * Dùng giá MUA VÀO của tiệm (giá bán lại được thật) để định giá tài sản.
 * Đọc phòng thủ: data có thể là mảng hoặc 1 object; bỏ qua giá không hợp lệ.
 */
const VT = "https://www.vang.today/api/prices";

async function getVT(url: string) {
  const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`vang.today trả về ${res.status}`);
  return parseVangToday(await res.json());
}

/** Tất cả mã vang.today đang trả về (để người dùng chọn đúng mã). */
export const listVangToday = () => getVT(VT);

/**
 * Giá vàng từ vang.today: VND / lượng. Dùng giá MUA VÀO (giá tiệm mua lại), không có thì dùng giá bán.
 * Lấy danh sách chung trước; mã nào thiếu thì gọi riêng ?type=CODE.
 */
export async function fetchVangToday(codes: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const want = [...new Set(codes)];
  if (!want.length) return out;
  const pick = (qs: GoldQuote[]) => {
    for (const q of qs) {
      const code = want.find((c) => c.toUpperCase() === q.code.toUpperCase());
      if (code && !out[code]) out[code] = q.buy > 0 ? q.buy : q.sell;
    }
  };
  let firstErr: Error | null = null;
  try { pick(await getVT(VT)); } catch (e) { firstErr = e as Error; }
  const missing = want.filter((c) => !out[c]);
  await Promise.all(missing.map(async (c) => {
    try { pick(await getVT(`${VT}?type=${encodeURIComponent(c)}`)); } catch (e) { firstErr ??= e as Error; }
  }));
  if (!Object.keys(out).length && firstErr) throw firstErr;
  return out;
}

/** Tách nguồn giá: coingecko:<id> | vangtoday:<CODE>:<chi|luong> */
export function parseSource(src: string) {
  const [kind, a, b] = src.split(":");
  if (kind === "coingecko" && a) return { kind: "coingecko" as const, id: a };
  if (kind === "vangtoday" && a) return { kind: "vangtoday" as const, code: a, perChi: b !== "luong" };
  return null;
}

/** Cập nhật giá cho các tài sản có nguồn giá tự động. Nguồn nào lỗi thì giữ giá cũ. */
export async function refreshPrices(owner?: number) {
  const items = (await autoMarket(owner)).map((i) => ({ ...i, src: parseSource(i.source) })).filter((i) => i.src);
  const coinIds = items.flatMap((i) => (i.src!.kind === "coingecko" ? [i.src!.id] : []));
  const goldCodes = items.flatMap((i) => (i.src!.kind === "vangtoday" ? [i.src!.code] : []));
  const errors: string[] = [];
  const [coin, gold] = await Promise.all([
    fetchCoinGeckoVnd(coinIds).catch((e) => { errors.push((e as Error).message); return {} as Record<string, number>; }),
    fetchVangToday(goldCodes).catch((e) => { errors.push((e as Error).message); return {} as Record<string, number>; }),
  ]);
  const date = fd(today());
  let updated = 0;
  const missing: string[] = [];
  for (const it of items) {
    const s = it.src!;
    const price = s.kind === "coingecko" ? coin[s.id] : gold[s.code] ? (s.perChi ? gold[s.code] / 10 : gold[s.code]) : undefined;
    if (price) { await setMarketPrice(it.id, it.owner, price, date); updated++; }
    else missing.push(s.kind === "coingecko" ? s.id : s.code);
  }
  if (!updated && errors.length) throw new Error(errors.join("; "));
  return { updated, missing: [...new Set(missing)], errors };
}
