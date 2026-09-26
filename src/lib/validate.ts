// Validate & chuẩn hoá input từ client. Thuần TS, test được độc lập.
import type { DepositInput, HoldingInput, HoldingType } from "./types.ts";

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

export function parseDeposit(b: Record<string, unknown>): DepositInput {
  const institution = str(b.institution, 100);
  if (!institution) throw new ValidationError("Thiếu nơi gửi");
  const principal = Math.round(num(b.principal, "Số tiền gốc", { min: 1 }));
  const openDate = date(b.openDate, "Ngày gửi");
  const maturityDate = date(b.maturityDate, "Ngày đáo hạn");
  if (maturityDate <= openDate) throw new ValidationError("Ngày đáo hạn phải sau ngày gửi");
  const status = b.status === "closed" ? "closed" : "active";
  const closeDate = optDate(b.closeDate, "Ngày tất toán");
  const closeType = b.closeType === "early" || b.closeType === "matured" ? b.closeType : null;
  if (status === "closed" && (!closeDate || !closeType)) throw new ValidationError("Sổ đã tất toán cần ngày và loại tất toán");
  if (closeDate && closeDate < openDate) throw new ValidationError("Ngày tất toán phải sau ngày gửi");
  return {
    institution,
    label: str(b.label, 100),
    principal,
    rate: num(b.rate, "Lãi suất", { max: 100 }),
    termMonths: Math.round(num(b.termMonths ?? 0, "Kỳ hạn", { max: 600 })),
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
