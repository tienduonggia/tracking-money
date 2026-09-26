// Domain logic dùng chung cho client và server. Không import gì từ Node/React.
import type { Deposit, Holding, HoldingType } from "./types.ts";

export const DAY = 86_400_000;

/** "YYYY-MM-DD" -> UTC ms */
export const pd = (s: string | null | undefined): number => {
  if (!s) return NaN;
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
/** UTC ms -> "YYYY-MM-DD" */
export const fd = (t: number): string => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};
/** Hôm nay theo giờ Việt Nam (UTC+7), dạng UTC ms của nửa đêm. */
export const today = (now: Date = new Date()): number => {
  const vn = new Date(now.getTime() + 7 * 3600_000);
  return Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate());
};
export const days = (a: number, b: number) => Math.round((b - a) / DAY);

/** Cộng tháng, kẹp về ngày cuối tháng (31/01 + 1 tháng = 28/02 hoặc 29/02). */
export const addMonths = (s: string, m: number): string => {
  const t = new Date(pd(s));
  const y = t.getUTCFullYear(), mo = t.getUTCMonth() + m, d = t.getUTCDate();
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return fd(Date.UTC(y, mo, Math.min(d, last)));
};

/* ---------- formatting ---------- */
const vn = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const vn2 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
export const fmt = (n: number) => vn.format(Math.round(n || 0));
export const fmt2 = (n: number) => vn2.format(n || 0);
export const money = (n: number | null | undefined) => `${vn.format(Math.round(n || 0))} ₫`;
export const moneyS = (n: number): string => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1e9) return `${s}${vn2.format(a / 1e9)} tỷ`;
  if (a >= 1e6) return `${s}${vn2.format(Math.round(a / 1e4) / 100)} tr`;
  if (a >= 1e3) return `${s}${vn.format(a / 1e3)}k`;
  return s + vn.format(a);
};
export const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${vn.format(Math.abs(Math.round(n)))} ₫`;
export const dstr = (s: string | null | undefined) => {
  if (!s) return "–";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};
export const parseMoney = (v: string | number | null | undefined): number => {
  const n = Number(String(v ?? "").replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/* ---------- asset types ---------- */
export const TYPES: Record<HoldingType | "saving", { label: string; color: string }> = {
  saving: { label: "Tiết kiệm", color: "var(--s1)" },
  etf: { label: "ETF / CCQ", color: "var(--s2)" },
  coin: { label: "Coin", color: "var(--s3)" },
  gold: { label: "Vàng", color: "var(--s4)" },
  stock: { label: "Cổ phiếu", color: "var(--s6)" },
  cash: { label: "Tiền mặt", color: "var(--s5)" },
  other: { label: "Khác", color: "var(--ink-3)" },
};
export const TYPE_ORDER = ["saving", "etf", "coin", "gold", "stock", "cash", "other"] as const;

/* ---------- interest math (lãi đơn, cuối kỳ, số ngày thực tế / 365) ---------- */
type DepTerms = Pick<Deposit, "principal" | "rate" | "openDate" | "maturityDate">;

export const termDays = (d: Pick<Deposit, "openDate" | "maturityDate">) =>
  Math.max(1, days(pd(d.openDate), pd(d.maturityDate)));
export const expGross = (d: DepTerms) => (d.principal * d.rate) / 100 * termDays(d) / 365;
export const accrued = (d: DepTerms, t: number) => {
  const o = pd(d.openDate), m = pd(d.maturityDate);
  const e = Math.min(Math.max(t, o), m);
  return (d.principal * d.rate) / 100 * days(o, e) / 365;
};
export const earlyInterest = (d: Pick<Deposit, "principal" | "earlyRate" | "openDate">, t: number) =>
  (d.principal * (d.earlyRate || 0)) / 100 * Math.max(0, days(pd(d.openDate), t)) / 365;
export const netClosed = (d: Pick<Deposit, "interest" | "tax" | "fee">) => (d.interest || 0) - (d.tax || 0) - (d.fee || 0);

/** Lãi phát sinh trong [a, b). Sổ đã tất toán: chia đều lãi thực nhận theo số ngày giữ. */
export function accrualInRange(d: Deposit, a: number, b: number, t: number): number {
  const o = pd(d.openDate);
  if (d.status === "closed") {
    const c = pd(d.closeDate);
    const tot = Math.max(1, days(o, c));
    const ov = Math.max(0, days(Math.max(o, a), Math.min(c, b)));
    return (d.interest || 0) * ov / tot;
  }
  const end = Math.min(pd(d.maturityDate), t);
  const ov = Math.max(0, days(Math.max(o, a), Math.min(end, b)));
  return (d.principal * d.rate) / 100 * ov / 365;
}

export function rangeBounds(r: string, t: number): [number, number, string] {
  if (r === "12m") {
    const b = t + DAY;
    return [b - 365 * DAY, b, "12 tháng gần nhất"];
  }
  const y = Number(r);
  return [Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1), `năm ${y}`];
}

export function totals(deps: Deposit[], hold: Holding[], t: number) {
  const act = deps.filter((d) => d.status !== "closed");
  const principal = act.reduce((s, d) => s + d.principal, 0);
  const acc = act.reduce((s, d) => s + accrued(d, t), 0);
  const expected = act.reduce((s, d) => s + expGross(d) * (1 - (d.taxPct || 0) / 100), 0);
  const byType: Record<string, number> = Object.fromEntries(TYPE_ORDER.map((k) => [k, 0]));
  byType.saving = principal + acc;
  let invVal = 0, invCost = 0;
  for (const h of hold) {
    const v = h.qty * h.price;
    byType[h.type] += v;
    if (h.type !== "cash") { invVal += v; invCost += h.cost; }
  }
  const cash = hold.filter((h) => h.type === "cash").reduce((s, h) => s + h.qty * h.price, 0);
  const nw = Object.values(byType).reduce((a, b) => a + b, 0);
  const wRate = principal ? act.reduce((s, d) => s + d.principal * d.rate, 0) / principal : 0;
  return { act, principal, acc, expected, byType, invVal, invCost, cash, nw, wRate };
}

export function yearStats(deps: Deposit[], r: string, t: number) {
  const [a, b, label] = rangeBounds(r, t);
  const closed = deps.filter((d) => d.status === "closed" && pd(d.closeDate) >= a && pd(d.closeDate) < b);
  const gross = closed.reduce((s, d) => s + (d.interest || 0), 0);
  const tax = closed.reduce((s, d) => s + (d.tax || 0), 0);
  const fee = closed.reduce((s, d) => s + (d.fee || 0), 0);
  const accrual = deps.reduce((s, d) => s + accrualInRange(d, a, b, t), 0);
  const earlies = closed.filter((d) => d.closeType === "early");
  // Lãi mất = lãi theo LS hợp đồng cho số ngày đã giữ − lãi thực nhận
  const lost = earlies.reduce((s, d) => s + Math.max(0, accrued(d, pd(d.closeDate)) - (d.interest || 0)), 0);
  const mLabels: [number, number][] = [];
  if (r === "12m") {
    const n = new Date(t);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - i, 1));
      mLabels.push([d.getUTCFullYear(), d.getUTCMonth()]);
    }
  } else for (let i = 0; i < 12; i++) mLabels.push([Number(r), i]);
  const months = mLabels.map(() => 0);
  for (const d of closed) {
    const c = new Date(pd(d.closeDate));
    const i = mLabels.findIndex(([y, m]) => y === c.getUTCFullYear() && m === c.getUTCMonth());
    if (i >= 0) months[i] += netClosed(d);
  }
  return { label, closed, gross, tax, fee, net: gross - tax - fee, accrual, lost, early: earlies.length, months, mLabels };
}
