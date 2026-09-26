import "server-only";
import { sql } from "./db.ts";
import type { Deposit, DepositInput, Holding, HoldingInput } from "./types.ts";

type Row = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const d = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v as string | null) ?? null);

const toDeposit = (r: Row): Deposit => ({
  id: r.id as string,
  institution: r.institution as string,
  label: r.label as string,
  principal: Number(r.principal),
  rate: Number(r.rate),
  termMonths: Number(r.term_months),
  openDate: d(r.open_date)!,
  maturityDate: d(r.maturity_date)!,
  earlyRate: Number(r.early_rate),
  taxPct: Number(r.tax_pct),
  note: r.note as string,
  status: r.status as Deposit["status"],
  closeDate: d(r.close_date),
  closeType: (r.close_type as Deposit["closeType"]) ?? null,
  interest: n(r.interest),
  tax: n(r.tax),
  fee: n(r.fee),
  renewedFrom: (r.renewed_from as string) ?? null,
});

const toHolding = (r: Row): Holding => ({
  id: r.id as string,
  type: r.type as Holding["type"],
  name: r.name as string,
  place: r.place as string,
  qty: Number(r.qty),
  unit: r.unit as string,
  cost: Number(r.cost),
  price: Number(r.price),
  priceDate: d(r.price_date),
  priceSource: r.price_source as string,
  note: r.note as string,
});

// Trả date dạng text để không lệch múi giờ
type Sql = ReturnType<typeof sql>;
const DEP_COLS = (s: Sql) => s`id, institution, label, principal, rate, term_months, open_date::text, maturity_date::text,
  early_rate, tax_pct, note, status, close_date::text, close_type, interest, tax, fee, renewed_from`;

const depRow = (x: DepositInput) => ({
  institution: x.institution, label: x.label, principal: x.principal, rate: x.rate, term_months: x.termMonths,
  open_date: x.openDate, maturity_date: x.maturityDate, early_rate: x.earlyRate, tax_pct: x.taxPct, note: x.note,
  status: x.status, close_date: x.closeDate, close_type: x.closeType, interest: x.interest, tax: x.tax, fee: x.fee,
  renewed_from: x.renewedFrom,
});
const holdRow = (x: HoldingInput) => ({
  type: x.type, name: x.name, place: x.place, qty: x.qty, unit: x.unit, cost: x.cost, price: x.price,
  price_date: x.priceDate, price_source: x.priceSource, note: x.note,
});

/* ---------- deposits ---------- */
export async function listDeposits(owner: number): Promise<Deposit[]> {
  const s = sql();
  const rows = await s`select ${DEP_COLS(s)} from deposits where owner_id = ${owner} order by maturity_date`;
  return rows.map(toDeposit);
}
export async function createDeposit(owner: number, x: DepositInput): Promise<Deposit> {
  const s = sql();
  const row = { ...depRow(x), owner_id: owner };
  const [r] = await s`insert into deposits ${s(row)} returning ${DEP_COLS(s)}`;
  return toDeposit(r);
}
export async function updateDeposit(owner: number, id: string, x: DepositInput): Promise<Deposit | null> {
  const s = sql();
  const [r] = await s`update deposits set ${s(depRow(x))}, updated_at = now()
    where id = ${id} and owner_id = ${owner} returning ${DEP_COLS(s)}`;
  return r ? toDeposit(r) : null;
}
export async function deleteDeposit(owner: number, id: string): Promise<boolean> {
  const r = await sql()`delete from deposits where id = ${id} and owner_id = ${owner}`;
  return r.count > 0;
}

/* ---------- holdings ---------- */
const HOLD_COLS = (s: Sql) => s`id, type, name, place, qty, unit, cost, price, price_date::text, price_source, note`;

export async function listHoldings(owner: number): Promise<Holding[]> {
  const s = sql();
  const rows = await s`select ${HOLD_COLS(s)} from holdings where owner_id = ${owner} order by created_at`;
  return rows.map(toHolding);
}
export async function createHolding(owner: number, x: HoldingInput): Promise<Holding> {
  const s = sql();
  const [r] = await s`insert into holdings ${s({ ...holdRow(x), owner_id: owner })} returning ${HOLD_COLS(s)}`;
  return toHolding(r);
}
export async function updateHolding(owner: number, id: string, x: HoldingInput): Promise<Holding | null> {
  const s = sql();
  const [r] = await s`update holdings set ${s(holdRow(x))}, updated_at = now()
    where id = ${id} and owner_id = ${owner} returning ${HOLD_COLS(s)}`;
  return r ? toHolding(r) : null;
}
export async function deleteHolding(owner: number, id: string): Promise<boolean> {
  const r = await sql()`delete from holdings where id = ${id} and owner_id = ${owner}`;
  return r.count > 0;
}

/** Holdings có nguồn giá tự động (mọi owner) — dùng cho cron. */
export async function autoPricedHoldings(owner?: number) {
  const s = sql();
  const rows = owner === undefined
    ? await s`select id, price_source from holdings where price_source like 'coingecko:%'`
    : await s`select id, price_source from holdings where price_source like 'coingecko:%' and owner_id = ${owner}`;
  return rows.map((r) => ({ id: r.id as string, source: r.price_source as string }));
}
export async function setPrice(id: string, price: number, date: string) {
  await sql()`update holdings set price = ${price}, price_date = ${date}, updated_at = now() where id = ${id}`;
}

/** Sổ đang gửi sắp đáo hạn / quá hạn — dùng cho nhắc nhở. */
export async function depositsDueWithin(daysAhead: number, todayStr: string) {
  const s = sql();
  const rows = await s`select owner_id, ${DEP_COLS(s)} from deposits
    where status = 'active' and maturity_date <= (${todayStr}::date + ${daysAhead}::int)
    order by owner_id, maturity_date`;
  return rows.map((r) => ({ owner: Number(r.owner_id), deposit: toDeposit(r) }));
}

/** Import từ bản xuất JSON (của artifact cũ hoặc của app này). Chạy trong 1 transaction. */
export async function importAll(owner: number, deps: DepositInput[], holds: HoldingInput[]) {
  return sql().begin(async (tx) => {
    for (const x of deps) await tx`insert into deposits ${tx({ ...depRow({ ...x, renewedFrom: null }), owner_id: owner })}`;
    for (const x of holds) await tx`insert into holdings ${tx({ ...holdRow(x), owner_id: owner })}`;
    return { deposits: deps.length, holdings: holds.length };
  });
}
