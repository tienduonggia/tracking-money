// Domain logic dùng chung cho client và server. Không import gì từ Node/React.
import type { Deposit, Holding, HoldingType, Tier } from "./types.ts";

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
type DepTerms = Pick<Deposit, "principal" | "rate" | "openDate" | "maturityDate"> & { tiers?: Tier[] | null };

export const termDays = (d: Pick<Deposit, "openDate" | "maturityDate">) =>
  Math.max(1, days(pd(d.openDate), pd(d.maturityDate)));

export interface Segment { start: number; end: number; rate: number; fromMonth: number; toMonth: number }

/** Các giai đoạn lãi của sổ. Lãi cố định = 1 giai đoạn. Bậc thang: mốc tính bằng addMonths từ ngày gửi. */
export function segments(d: DepTerms): Segment[] {
  const o = pd(d.openDate), m = pd(d.maturityDate);
  if (!d.tiers || !d.tiers.length) return [{ start: o, end: m, rate: d.rate, fromMonth: 0, toMonth: 0 }];
  const out: Segment[] = [];
  let prev = 0;
  for (const t of d.tiers) {
    const start = pd(addMonths(d.openDate, prev));
    const end = Math.min(pd(addMonths(d.openDate, t.upToMonth)), m);
    if (end > start) out.push({ start, end, rate: t.rate, fromMonth: prev, toMonth: t.upToMonth });
    prev = t.upToMonth;
  }
  return out;
}

const segInterest = (p: number, s: Segment, a: number, b: number) =>
  (p * s.rate) / 100 * Math.max(0, days(Math.max(s.start, a), Math.min(s.end, b))) / 365;

/** Lãi hợp đồng từ ngày gửi đến t (không vượt đáo hạn). */
export const accrued = (d: DepTerms, t: number) => {
  const o = pd(d.openDate);
  return segments(d).reduce((sum, s) => sum + segInterest(d.principal, s, o, t), 0);
};
export const expGross = (d: DepTerms) => accrued(d, pd(d.maturityDate));
/** Lãi bình quân %/năm nếu giữ đủ kỳ (dùng làm "rate" cho sổ bậc thang). */
export const effectiveRate = (d: DepTerms) => (expGross({ ...d, principal: 100 }) / 100) * 365 / termDays(d) * 100;

/**
 * Lãi khi rút trước hạn tại t.
 * Cố định: toàn bộ số ngày tính lãi không kỳ hạn.
 * Bậc thang: giữ đủ lãi các giai đoạn đã xong, phần ngày của giai đoạn đang dở tính lãi không kỳ hạn.
 */
export function earlyInterest(d: Pick<Deposit, "principal" | "earlyRate" | "openDate" | "maturityDate" | "rate"> & { tiers?: Tier[] | null }, t: number) {
  const o = pd(d.openDate);
  if (!d.tiers || !d.tiers.length) return (d.principal * (d.earlyRate || 0)) / 100 * Math.max(0, days(o, t)) / 365;
  let sum = 0;
  for (const s of segments(d)) {
    if (t >= s.end) sum += segInterest(d.principal, s, o, s.end);
    else if (t > s.start) sum += (d.principal * (d.earlyRate || 0)) / 100 * days(s.start, t) / 365;
  }
  return sum;
}

/** Giai đoạn đang chạy tại t (sổ bậc thang). */
export function currentSegment(d: DepTerms, t: number) {
  const segs = segments(d);
  const i = segs.findIndex((s) => t >= s.start && t < s.end);
  return i < 0 ? null : { index: i, count: segs.length, seg: segs[i] };
}

export const netClosed = (d: Pick<Deposit, "interest" | "tax" | "fee">) => (d.interest || 0) - (d.tax || 0) - (d.fee || 0);

/** Lãi phát sinh trong [a, b). Sổ đã tất toán: chia đều lãi thực nhận theo số ngày giữ. */
export function accrualInRange(d: Deposit, a: number, b: number, t: number): number {
  const o = pd(d.openDate);
  if (d.status === "closed") {
    // Sổ cố định: chia đều lãi thực nhận theo ngày giữ.
    // Sổ bậc thang: chia theo lãi hợp đồng từng bậc (bậc lãi cao nhận phần lớn hơn). Tổng các kỳ luôn bằng lãi thực nhận.
    const c = pd(d.closeDate);
    const lo = Math.max(o, a), hi = Math.min(c, b);
    if (hi <= lo) return 0;
    const shapeTot = d.tiers?.length ? accrued(d, c) : 0;
    if (shapeTot > 0) return (d.interest || 0) * (accrued(d, hi) - accrued(d, lo)) / shapeTot;
    return (d.interest || 0) * days(lo, hi) / Math.max(1, days(o, c));
  }
  const end = Math.min(pd(d.maturityDate), t);
  const lo = Math.max(o, a), hi = Math.min(end, b);
  return hi > lo ? accrued(d, hi) - accrued(d, lo) : 0;
}

/* ---------- mẫu sản phẩm ---------- */
export const PRESETS: { key: string; label: string; institution: string; tiers: Tier[]; taxPct: number; earlyRate: number; note: string }[] = [
  {
    key: "topi-flex",
    label: "Topi – Tích luỹ linh hoạt (6% / 6,6% / 6,6% / 7,2%)",
    institution: "Topi",
    tiers: [{ upToMonth: 3, rate: 6 }, { upToMonth: 6, rate: 6.6 }, { upToMonth: 9, rate: 6.6 }, { upToMonth: 12, rate: 7.2 }],
    taxPct: 5,
    earlyRate: 0.5,
    note: "Tích luỹ linh hoạt, tự tái đầu tư khi đáo hạn",
  },
];

/** Phần vốn mới của sổ: ghi rõ thì dùng; sổ cũ: tái tục → 0, còn lại → cả gốc. */
export const capitalOf = (d: Pick<Deposit, "newMoney" | "renewedFrom" | "principal">) =>
  d.newMoney ?? (d.renewedFrom ? 0 : d.principal);

/** Tiết kiệm từ trước tới nay: vốn thật đã bỏ vào và tổng lời (đã nhận + đang chạy). */
export function lifetime(deps: Deposit[], t: number) {
  const capital = deps.reduce((s, d) => s + capitalOf(d), 0);
  const realized = deps.filter((d) => d.status === "closed").reduce((s, d) => s + netClosed(d), 0);
  const running = deps.filter((d) => d.status !== "closed").reduce((s, d) => s + accrued(d, t) * (1 - (d.taxPct || 0) / 100), 0);
  const profit = realized + running;
  return { capital, realized, running, profit, pct: capital ? (profit / capital) * 100 : 0 };
}

/** Sổ đã tất toán mà tiền nhận về chưa được ghi (sổ cũ trước khi có tính năng, không phải sổ đã tái tục). */
export function pendingPayouts(deps: Deposit[]) {
  const renewed = new Set(deps.map((d) => d.renewedFrom).filter(Boolean));
  return deps.filter((d) => d.status === "closed" && d.payout === null && !renewed.has(d.id));
}

export function rangeBounds(r: string, t: number): [number, number, string] {
  if (r === "all") return [-8.64e15, 8.64e15, "toàn bộ"];
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
  // Cột biểu đồ: theo tháng (1 năm / 12 tháng gần nhất) hoặc theo năm (toàn bộ)
  const buckets: { key: string; label: string; tip: string; value: number }[] = [];
  const cur = new Date(t);
  if (r === "all") {
    const ys = deps.flatMap((d) => [d.openDate, d.closeDate]).filter(Boolean).map((x) => Number(x!.slice(0, 4)));
    const y0 = Math.min(cur.getUTCFullYear(), ...ys), y1 = Math.max(cur.getUTCFullYear(), ...ys);
    for (let y = y0; y <= y1; y++) buckets.push({ key: String(y), label: String(y), tip: `Năm ${y}`, value: 0 });
  } else {
    for (let i = 0; i < 12; i++) {
      const d = r === "12m"
        ? new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() - 11 + i, 1))
        : new Date(Date.UTC(Number(r), i, 1));
      const y = d.getUTCFullYear(), m = d.getUTCMonth();
      buckets.push({ key: `${y}-${m}`, label: `T${m + 1}`, tip: `Tháng ${m + 1}/${y}`, value: 0 });
    }
  }
  for (const d of closed) {
    const c = new Date(pd(d.closeDate));
    const key = r === "all" ? String(c.getUTCFullYear()) : `${c.getUTCFullYear()}-${c.getUTCMonth()}`;
    const bk = buckets.find((x) => x.key === key);
    if (bk) bk.value += netClosed(d);
  }
  return { label, closed, gross, tax, fee, net: gross - tax - fee, accrual, lost, early: earlies.length, buckets };
}
