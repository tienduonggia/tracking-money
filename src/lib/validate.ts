// Validate & chuẩn hoá input từ client. Thuần TS, test được độc lập.
import type { Compounding, DepositInput, FlexInput, FlexTxn, HoldingInput, HoldingTxn, HoldingType, MarketPriceInput, Tier } from "./types.ts";
import { addMonths, effectiveRate, position } from "./calc.ts";

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
  const qty = Array.isArray(b.txns) && b.txns.length ? 0 : num(b.qty, "Số lượng");
  const cash = type === "cash";
  const priceSource = str(b.priceSource, 100);
  if (priceSource && !/^(coingecko:[a-z0-9-]+|vangtoday:[A-Z0-9]+:(chi|luong))$/.test(priceSource)) throw new ValidationError("Nguồn giá không hợp lệ");
  const txns = cash ? [] : parseHoldingTxns(b.txns);
  const pos = txns.length ? position(txns) : null;
  return {
    type,
    name,
    place: str(b.place, 100),
    qty: pos ? pos.qty : qty,
    unit: cash ? "₫" : str(b.unit, 30),
    cost: cash ? Math.round(qty) : pos ? Math.round(pos.cost) : Math.round(num(b.cost ?? 0, "Tổng vốn")),
    price: cash ? 1 : num(b.price ?? 0, "Giá"),
    priceDate: optDate(b.priceDate, "Ngày giá"),
    priceSource: cash ? "" : priceSource,
    txns,
    priceKey: cash ? "" : str(b.priceKey, 100),
    note: str(b.note, 500),
  };
}

/* ---------- Tích luỹ không kỳ hạn ---------- */
const COMPOUNDING: Compounding[] = ["daily", "monthly", "none"];

export function parseFlex(b: Record<string, unknown>): FlexInput {
  const institution = str(b.institution, 100);
  if (!institution) throw new ValidationError("Thiếu nơi gửi");
  const compounding = COMPOUNDING.includes(b.compounding as Compounding) ? (b.compounding as Compounding) : "none";
  if (!Array.isArray(b.rates) || !b.rates.length || b.rates.length > 200) throw new ValidationError("Cần ít nhất một mức lãi suất");
  const rates = b.rates
    .map((r, i) => {
      const x = (r ?? {}) as Record<string, unknown>;
      return { from: date(x.from, `Lãi suất #${i + 1}: ngày áp dụng`), rate: num(x.rate, `Lãi suất #${i + 1}`, { max: 100 }) };
    })
    .sort((p, q) => (p.from < q.from ? -1 : 1));
  const rawTx = Array.isArray(b.txns) ? b.txns : [];
  if (rawTx.length > 2000) throw new ValidationError("Quá nhiều giao dịch");
  const txns: FlexTxn[] = rawTx.map((t, i) => {
    const x = (t ?? {}) as Record<string, unknown>;
    const kind = x.kind === "deposit" || x.kind === "withdraw" || x.kind === "adjust" ? x.kind : null;
    if (!kind) throw new ValidationError(`Giao dịch #${i + 1}: loại không hợp lệ`);
    const amount = Math.round(num(x.amount, `Giao dịch #${i + 1}: số tiền`, { min: kind === "adjust" ? -1e15 : 1 }));
    const id = typeof x.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(x.id) ? x.id : `t${i}-${Date.now().toString(36)}`;
    return { id, date: date(x.date, `Giao dịch #${i + 1}: ngày`), kind, amount, external: kind === "adjust" ? false : x.external !== false, note: str(x.note, 200) };
  });
  return { institution, name: str(b.name, 100), compounding, taxPct: num(b.taxPct ?? 0, "Thuế", { max: 100 }), rates, txns, note: str(b.note, 500) };
}

/** Lịch sử mua/bán: tối đa 1000 dòng; không cho bán quá số đang giữ. */
export function parseHoldingTxns(v: unknown): HoldingTxn[] {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v) || v.length > 1000) throw new ValidationError("Lịch sử giao dịch không hợp lệ");
  const txns = v.map((t, i) => {
    const x = (t ?? {}) as Record<string, unknown>;
    const kind = x.kind === "buy" || x.kind === "sell" ? x.kind : null;
    if (!kind) throw new ValidationError(`Giao dịch #${i + 1}: loại không hợp lệ`);
    return {
      id: typeof x.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(x.id) ? x.id : `h${i}-${Date.now().toString(36)}`,
      date: date(x.date, `Giao dịch #${i + 1}: ngày`),
      kind,
      qty: num(x.qty, `Giao dịch #${i + 1}: số lượng`, { min: 1e-12 }),
      price: num(x.price, `Giao dịch #${i + 1}: giá`),
      fee: num(x.fee ?? 0, `Giao dịch #${i + 1}: phí`),
      note: str(x.note, 200),
    } as HoldingTxn;
  });
  // kiểm tra không bán vượt số lượng theo thứ tự thời gian
  let q = 0;
  for (const x of [...txns].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === "buy" ? -1 : 1))) {
    q += x.kind === "buy" ? x.qty : -x.qty;
    if (q < -1e-9) throw new ValidationError(`Bán ${x.qty} ngày ${x.date} vượt số lượng đang giữ`);
  }
  return txns;
}

/* ---------- Giá thị trường ---------- */
export function parseMarketPrice(b: Record<string, unknown>): MarketPriceInput {
  const label = str(b.label, 100);
  if (!label) throw new ValidationError("Thiếu tên loại tài sản");
  const source = str(b.source, 100);
  if (source && !/^(coingecko:[a-z0-9-]+|vangtoday:[A-Z0-9]+:(chi|luong))$/.test(source)) throw new ValidationError("Nguồn giá không hợp lệ");
  const key = str(b.key, 100) || source || label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "gia";
  return { key, label, unit: str(b.unit, 30), source, price: num(b.price ?? 0, "Giá"), priceDate: optDate(b.priceDate, "Ngày giá") };
}
