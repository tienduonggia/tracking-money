// Validate & chuẩn hoá input từ client. Thuần TS, test được độc lập.
import type { DepositInput, HoldingInput, HoldingType, Tier } from "./types.ts";
import { addMonths, effectiveRate } from "./calc.ts";

export class ValidationError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES: HoldingType[] = ["etf", "stock", "coin", "gold", "cash", "other"];

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, field: string, { min = 0, max = 1e15 } = {}) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new ValidationError(`${field} không hợp lệ`);
  return n;
};
const optNum = (v: unknown, field: string) => (v === null || v === undefined || v === "" ? null : Math.round(num(v, field)));
const date = (v: unknown, field: string) => {
  if (typeof v !== "string" || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) throw new ValidationError(`${field} không hợp lệ`);
  return v;
};
const optDate = (v: unknown, field: string) => (v === null || v === undefined || v === "" ? null : date(v, field));

/** Bậc lãi: 1–12 bậc, mốc tháng tăng dần (số nguyên 1–600), lãi 0–100. */
export function parseTiers(v: unknown): Tier[] | null {
  if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) return null;
  if (!Array.isArray(v) || v.length > 12) throw new ValidationError("Bậc lãi không hợp lệ (tối đa 12 bậc)");
  let prev = 0;
  return v.map((t, i) => {
    const r = (t ?? {}) as Record<string, unknown>;
    const upToMonth = Number(r.upToMonth);
    if (!Number.isInteger(upToMonth) || upToMonth <= prev || upToMonth > 600) throw new ValidationError(`Bậc ${i + 1}: mốc tháng phải là số nguyên lớn hơn bậc trước`);
    prev = upToMonth;
    return { upToMonth, rate: num(r.rate, `Bậc ${i + 1}: lãi suất`, { max: 100 }) };
  });
}

export function parseDeposit(b: Record<string, unknown>): DepositInput {
  const institution = str(b.institution, 100);
  if (!institution) throw new ValidationError("Thiếu nơi gửi");
  const principal = Math.round(num(b.principal, "Số tiền gốc", { min: 1 }));
  const openDate = date(b.openDate, "Ngày gửi");
  const tiers = parseTiers(b.tiers);
  // Sổ bậc thang: kỳ hạn = mốc cuối, ngày đáo hạn suy ra từ ngày gửi
  const maturityDate = tiers ? addMonths(openDate, tiers[tiers.length - 1].upToMonth) : date(b.maturityDate, "Ngày đáo hạn");
  if (maturityDate <= openDate) throw new ValidationError("Ngày đáo hạn phải sau ngày gửi");
  const status = b.status === "closed" ? "closed" : "active";
  const closeDate = optDate(b.closeDate, "Ngày tất toán");
  const closeType = b.closeType === "early" || b.closeType === "matured" ? b.closeType : null;
  if (status === "closed" && (!closeDate || !closeType)) throw new ValidationError("Sổ đã tất toán cần ngày và loại tất toán");
  if (closeDate && closeDate < openDate) throw new ValidationError("Ngày tất toán phải sau ngày gửi");
  const termMonths = tiers ? tiers[tiers.length - 1].upToMonth : Math.round(num(b.termMonths ?? 0, "Kỳ hạn", { max: 600 }));
  const rate = tiers
    ? Math.round(effectiveRate({ principal, rate: 0, openDate, maturityDate, tiers }) * 1000) / 1000
    : num(b.rate, "Lãi suất", { max: 100 });
  return {
    institution,
    label: str(b.label, 100),
    principal,
    rate,
    tiers,
    termMonths,
    openDate,
    maturityDate,
    earlyRate: num(b.earlyRate ?? 0.5, "Lãi không kỳ hạn", { max: 100 }),
    taxPct: num(b.taxPct ?? 0, "Thuế", { max: 100 }),
    note: str(b.note, 500),
    status,
    closeDate: status === "closed" ? closeDate : null,
    closeType: status === "closed" ? closeType : null,
    interest: status === "closed" ? optNum(b.interest, "Tiền lãi") ?? 0 : null,
    tax: status === "closed" ? optNum(b.tax, "Thuế") ?? 0 : null,
    fee: status === "closed" ? optNum(b.fee, "Phí") ?? 0 : null,
    newMoney: b.newMoney === null || b.newMoney === undefined || b.newMoney === "" ? null : Math.min(principal, Math.round(num(b.newMoney, "Vốn mới"))),
    payout: status === "closed" && (b.payout === "cash" || b.payout === "none") ? b.payout : null,
    renewedFrom: typeof b.renewedFrom === "string" && /^[0-9a-f-]{36}$/i.test(b.renewedFrom) ? b.renewedFrom : null,
  };
}

export function parseHolding(b: Record<string, unknown>): HoldingInput {
  const type = TYPES.includes(b.type as HoldingType) ? (b.type as HoldingType) : null;
  if (!type) throw new ValidationError("Loại tài sản không hợp lệ");
  const name = str(b.name, 100);
  if (!name) throw new ValidationError("Thiếu tên tài sản");
  const qty = num(b.qty, "Số lượng");
  const cash = type === "cash";
  const priceSource = str(b.priceSource, 100);
  if (priceSource && !/^coingecko:[a-z0-9-]+$/.test(priceSource)) throw new ValidationError("Nguồn giá không hợp lệ");
  return {
    type,
    name,
    place: str(b.place, 100),
    qty,
    unit: cash ? "₫" : str(b.unit, 30),
    cost: cash ? Math.round(qty) : Math.round(num(b.cost ?? 0, "Tổng vốn")),
    price: cash ? 1 : num(b.price ?? 0, "Giá"),
    priceDate: optDate(b.priceDate, "Ngày giá"),
    priceSource: cash ? "" : priceSource,
    note: str(b.note, 500),
  };
}
