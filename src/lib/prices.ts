import "server-only";
import { autoPricedHoldings, setPrice } from "./repo.ts";
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

/** Cập nhật giá cho các tài sản có nguồn giá tự động. */
export async function refreshPrices(owner?: number) {
  const items = await autoPricedHoldings(owner);
  const ids = items.map((i) => i.source.replace(/^coingecko:/, ""));
  const prices = await fetchCoinGeckoVnd(ids);
  const date = fd(today());
  let updated = 0;
  const missing: string[] = [];
  for (const it of items) {
    const id = it.source.replace(/^coingecko:/, "");
    if (prices[id]) {
      await setPrice(it.id, prices[id], date);
      updated++;
    } else missing.push(id);
  }
  return { updated, missing: [...new Set(missing)] };
}
