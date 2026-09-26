"use client";
import { useState } from "react";
import type { Deposit, DepositInput, Holding, HoldingInput, HoldingType } from "@/lib/types.ts";
import {
  accrued, addMonths, days, dstr, earlyInterest, expGross, fd, fmt2, money, netClosed, pd, signed, termDays, today,
} from "@/lib/calc.ts";
import { Modal, MoneyInput, Confirm } from "./ui.tsx";

const TERMS = [1, 3, 6, 9, 12, 13, 18, 24, 36];

/* ======================= Deposit ======================= */
export type DepositDraft = Partial<DepositInput> & { id?: string };

export function DepositDialog({ draft, institutions, onClose, onSave, onDelete }: {
  draft: DepositDraft | null; // null = đóng
  institutions: string[];
  onClose: () => void;
  onSave: (id: string | undefined, x: DepositInput) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <Modal open={!!draft} onClose={onClose}>
      {draft && <DepositForm key={draft.id ?? "new"} draft={draft} institutions={institutions} onClose={onClose} onSave={onSave} onDelete={onDelete} />}
    </Modal>
  );
}

function DepositForm({ draft, institutions, onClose, onSave, onDelete }: {
  draft: DepositDraft; institutions: string[]; onClose: () => void;
  onSave: (id: string | undefined, x: DepositInput) => Promise<boolean>; onDelete: (id: string) => Promise<void>;
}) {
  const open0 = draft.openDate ?? fd(today());
  const term0 = draft.termMonths ?? 6;
  const [f, setF] = useState({
    institution: draft.institution ?? "",
    label: draft.label ?? "",
    principal: (draft.principal ?? null) as number | null,
    rate: draft.rate !== undefined ? String(draft.rate) : "",
    openDate: open0,
    termMonths: TERMS.includes(term0) ? term0 : 0,
    maturityDate: draft.maturityDate ?? addMonths(open0, term0 || 6),
    earlyRate: String(draft.earlyRate ?? 0.5),
    taxPct: String(draft.taxPct ?? 0),
    note: draft.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const setOpen = (v: string) => setF((p) => ({ ...p, openDate: v, maturityDate: p.termMonths && v ? addMonths(v, p.termMonths) : p.maturityDate }));
  const setTerm = (m: number) => setF((p) => ({ ...p, termMonths: m, maturityDate: m && p.openDate ? addMonths(p.openDate, m) : p.maturityDate }));

  const principal = f.principal ?? 0, rate = Number(f.rate) || 0, taxPct = Number(f.taxPct) || 0;
  const valid = principal > 0 && rate > 0 && f.openDate && f.maturityDate && pd(f.maturityDate) > pd(f.openDate);
  const g = valid ? expGross({ principal, rate, openDate: f.openDate, maturityDate: f.maturityDate }) : 0;
  const tax = (g * taxPct) / 100;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    const base: DepositInput = {
      institution: f.institution.trim(), label: f.label.trim(), principal, rate, termMonths: f.termMonths,
      openDate: f.openDate, maturityDate: f.maturityDate, earlyRate: Number(f.earlyRate) || 0, taxPct, note: f.note.trim(),
      status: draft.status ?? "active", closeDate: draft.closeDate ?? null, closeType: draft.closeType ?? null,
      interest: draft.interest ?? null, tax: draft.tax ?? null, fee: draft.fee ?? null, renewedFrom: draft.renewedFrom ?? null,
    };
    const ok = await onSave(draft.id, base);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <>
      <h3>{draft.id ? "Sửa sổ tiết kiệm" : "Thêm sổ tiết kiệm"}</h3>
      <div className="fields">
        <label className="f">Nơi gửi
          <input id="d_inst" list="instList" required value={f.institution} onChange={(e) => set("institution", e.target.value)} placeholder="MB Bank, Timo, Topi…" />
        </label>
        <label className="f">Tên sổ <span className="hint">(tuỳ chọn)</span>
          <input id="d_label" value={f.label} onChange={(e) => set("label", e.target.value)} placeholder="Quỹ khẩn cấp" />
        </label>
        <label className="f">Số tiền gốc (₫)
          <MoneyInput id="d_principal" required value={f.principal} onChange={(v) => set("principal", v)} placeholder="50.000.000" />
        </label>
        <label className="f">Lãi suất (%/năm)
          <input id="d_rate" type="number" step="0.01" min="0" required value={f.rate} onChange={(e) => set("rate", e.target.value)} placeholder="5.2" />
        </label>
        <label className="f">Ngày gửi
          <input id="d_open" type="date" required value={f.openDate} onChange={(e) => setOpen(e.target.value)} />
        </label>
        <label className="f">Kỳ hạn
          <select id="d_term" value={f.termMonths} onChange={(e) => setTerm(Number(e.target.value))}>
            {TERMS.map((m) => <option key={m} value={m}>{m} tháng</option>)}
            <option value={0}>Tự nhập ngày đáo hạn</option>
          </select>
        </label>
        <label className="f">Ngày đáo hạn
          <input id="d_mat" type="date" required value={f.maturityDate} onChange={(e) => set("maturityDate", e.target.value)} />
        </label>
        <label className="f">Lãi không kỳ hạn (%/năm) <span className="hint">áp khi rút trước hạn</span>
          <input id="d_early" type="number" step="0.01" min="0" value={f.earlyRate} onChange={(e) => set("earlyRate", e.target.value)} />
        </label>
        <label className="f">Thuế trên lãi (%) <span className="hint">ngân hàng: 0</span>
          <input id="d_tax" type="number" step="0.01" min="0" value={f.taxPct} onChange={(e) => set("taxPct", e.target.value)} />
        </label>
        <label className="f">Ghi chú
          <input id="d_note" value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Online, tái tục gốc…" />
        </label>
      </div>
      <div className="calc">
        {valid ? (
          <>
            <div className="row"><span>Số ngày gửi</span><span className="num">{termDays(f)} ngày</span></div>
            <div className="row"><span>Lãi dự kiến (gốc × LS × ngày / 365)</span><span className="num">{money(g)}</span></div>
            {tax > 0 && <div className="row"><span>Thuế {taxPct}%</span><span className="num">−{money(tax)}</span></div>}
            <div className="row total"><span>Nhận khi đáo hạn</span><span className="num">{money(principal + g - tax)}</span></div>
          </>
        ) : <span className="note">Nhập gốc, lãi suất và ngày (đáo hạn sau ngày gửi) để xem lãi dự kiến.</span>}
      </div>
      <div className="dlg-actions">
        {draft.id && <button type="button" className="btn ghost danger left" onClick={() => setConfirmDel(true)}>Xoá sổ</button>}
        <button type="button" className="btn" onClick={onClose}>Huỷ</button>
        <button type="button" className="btn primary" disabled={!valid || !f.institution.trim() || busy} onClick={submit}>{busy ? "Đang lưu…" : "Lưu"}</button>
      </div>
      <Confirm
        open={confirmDel}
        title="Xoá sổ?"
        text={`Xoá sổ ${f.institution} ${money(principal)}. Không hoàn tác được.`}
        okLabel="Xoá"
        onClose={() => setConfirmDel(false)}
        onOk={async () => { await onDelete(draft.id!); onClose(); }}
      />
    </>
  );
}

/* ======================= Close (tất toán) ======================= */
export type Rollover = "none" | "principal" | "all";

export function CloseDialog({ deposit, onClose, onConfirm }: {
  deposit: Deposit | null;
  onClose: () => void;
  onConfirm: (d: Deposit, x: DepositInput, roll: Rollover) => Promise<boolean>;
}) {
  return (
    <Modal open={!!deposit} onClose={onClose}>
      {deposit && <CloseForm key={deposit.id} d={deposit} onClose={onClose} onConfirm={onConfirm} />}
    </Modal>
  );
}

function suggested(d: Deposit, date: string) {
  const c = pd(date);
  const early = c < pd(d.maturityDate);
  const gi = early ? earlyInterest(d, c) : expGross(d);
  return { early, gi, tax: (gi * (d.taxPct || 0)) / 100 };
}

function CloseForm({ d, onClose, onConfirm }: { d: Deposit; onClose: () => void; onConfirm: (d: Deposit, x: DepositInput, roll: Rollover) => Promise<boolean> }) {
  const t = today();
  const m = pd(d.maturityDate);
  const [date, setDate] = useState(fd(t >= m ? m : Math.max(t, pd(d.openDate) + 86_400_000)));
  const s0 = suggested(d, date);
  const [gi, setGi] = useState<number | null>(Math.round(s0.gi));
  const [tax, setTax] = useState<number | null>(Math.round(s0.tax));
  const [fee, setFee] = useState<number | null>(0);
  const [roll, setRoll] = useState<Rollover>("none");
  const [busy, setBusy] = useState(false);

  const changeDate = (v: string) => {
    setDate(v);
    if (!v) return;
    const s = suggested(d, v);
    setGi(Math.round(s.gi));
    setTax(Math.round(s.tax));
  };
  const valid = !!date && pd(date) > pd(d.openDate);
  const s = valid ? suggested(d, date) : s0;
  const held = valid ? days(pd(d.openDate), pd(date)) : 0;
  const net = (gi || 0) - (tax || 0) - (fee || 0);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    const { id: _id, ...rest } = d;
    void _id;
    const ok = await onConfirm(d, {
      ...rest, status: "closed", closeDate: date, closeType: s.early ? "early" : "matured",
      interest: gi || 0, tax: tax || 0, fee: fee || 0,
    }, roll);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <>
      <h3>Tất toán sổ</h3>
      <div className="note">{d.institution}{d.label ? ` · ${d.label}` : ""} · gốc {money(d.principal)} · {fmt2(d.rate)}%/năm · đáo hạn {dstr(d.maturityDate)}</div>
      <div className="fields">
        <label className="f">Ngày rút<input id="c_date" type="date" required value={date} onChange={(e) => changeDate(e.target.value)} /></label>
        <label className="f">Loại<input id="c_type" readOnly value={s.early ? "Rút trước hạn" : "Đúng hạn"} /></label>
        <label className="f">Tiền lãi nhận trước thuế/phí (₫) <span className="hint">sửa theo sao kê</span>
          <MoneyInput id="c_interest" value={gi} onChange={setGi} /></label>
        <label className="f">Thuế (₫)<MoneyInput id="c_tax" value={tax} onChange={setTax} /></label>
        <label className="f">Phí (₫) <span className="hint">phí rút, chuyển khoản…</span><MoneyInput id="c_fee" value={fee} onChange={setFee} /></label>
        <label className="f">Tái tục
          <select id="c_roll" value={roll} onChange={(e) => setRoll(e.target.value as Rollover)}>
            <option value="none">Không, rút về tài khoản</option>
            <option value="principal">Tái tục gốc</option>
            <option value="all">Tái tục gốc + lãi</option>
          </select>
        </label>
      </div>
      <div className="calc">
        <div className="row"><span>Gửi {held} ngày · lãi gợi ý {s.early ? `(LS không kỳ hạn ${fmt2(d.earlyRate)}%)` : ""}</span><span className="num">{money(s.gi)}</span></div>
        {s.early && <div className="row neg"><span>Lãi mất so với giữ đến hạn</span><span className="num">−{money(Math.max(0, accrued(d, pd(date)) - (gi || 0)))}</span></div>}
        <div className="row"><span>Lãi ròng</span><span className="num">{money(net)}</span></div>
        <div className="row total"><span>Tổng nhận về</span><span className="num">{money(d.principal + net)}</span></div>
      </div>
      <div className="dlg-actions">
        <button type="button" className="btn" onClick={onClose}>Huỷ</button>
        <button type="button" className="btn primary" disabled={!valid || busy} onClick={submit}>{busy ? "Đang lưu…" : "Xác nhận tất toán"}</button>
      </div>
    </>
  );
}

/** Sổ mới khi tái tục (người dùng xem lại LS rồi bấm Lưu). */
export function renewalDraft(d: Deposit, closed: DepositInput, roll: Rollover): DepositDraft {
  const p = roll === "all" ? d.principal + netClosed(closed) : d.principal;
  const term = d.termMonths || 6;
  return {
    institution: d.institution, label: d.label, principal: Math.round(p), rate: d.rate, openDate: closed.closeDate!,
    termMonths: term, maturityDate: addMonths(closed.closeDate!, term), earlyRate: d.earlyRate, taxPct: d.taxPct,
    note: `Tái tục từ sổ ${dstr(d.openDate)}`, renewedFrom: d.id, status: "active",
  };
}

/* ======================= Holding ======================= */
export type HoldingDraft = Partial<HoldingInput> & { id?: string };

const COINS: [string, string][] = [
  ["bitcoin", "BTC"], ["ethereum", "ETH"], ["tether", "USDT"], ["binancecoin", "BNB"], ["solana", "SOL"],
  ["ripple", "XRP"], ["the-open-network", "TON"], ["dogecoin", "DOGE"],
];

export function HoldingDialog({ draft, places, onClose, onSave, onDelete }: {
  draft: HoldingDraft | null; places: string[]; onClose: () => void;
  onSave: (id: string | undefined, x: HoldingInput) => Promise<boolean>; onDelete: (id: string) => Promise<void>;
}) {
  return (
    <Modal open={!!draft} onClose={onClose}>
      {draft && <HoldingForm key={draft.id ?? "new"} draft={draft} places={places} onClose={onClose} onSave={onSave} onDelete={onDelete} />}
    </Modal>
  );
}

function HoldingForm({ draft, onClose, onSave, onDelete }: {
  draft: HoldingDraft; places: string[]; onClose: () => void;
  onSave: (id: string | undefined, x: HoldingInput) => Promise<boolean>; onDelete: (id: string) => Promise<void>;
}) {
  const [f, setF] = useState({
    type: (draft.type ?? "etf") as HoldingType,
    name: draft.name ?? "",
    place: draft.place ?? "",
    qty: draft.qty !== undefined ? String(draft.qty) : "",
    unit: draft.unit ?? "",
    cost: (draft.cost ?? null) as number | null,
    price: (draft.price ?? null) as number | null,
    coinId: (draft.priceSource ?? "").replace(/^coingecko:/, ""),
    note: draft.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const cash = f.type === "cash";
  const qty = Number(f.qty) || 0;
  const cost = cash ? qty : f.cost || 0;
  const price = cash ? 1 : f.price || 0;
  const value = qty * price;
  const autoPrice = f.type === "coin" && !!f.coinId.trim();

  const submit = async () => {
    setBusy(true);
    const priceChanged = !draft.id || draft.price !== price;
    const ok = await onSave(draft.id, {
      type: f.type, name: f.name.trim(), place: f.place.trim(), qty, unit: cash ? "₫" : f.unit.trim(), cost, price,
      priceDate: priceChanged ? fd(today()) : draft.priceDate ?? null,
      priceSource: autoPrice ? `coingecko:${f.coinId.trim().toLowerCase()}` : "",
      note: f.note.trim(),
    });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <>
      <h3>{draft.id ? "Sửa tài sản" : "Thêm tài sản"}</h3>
      <div className="fields">
        <label className="f">Loại
          <select id="h_type" value={f.type} onChange={(e) => set("type", e.target.value as HoldingType)}>
            <option value="etf">ETF / Chứng chỉ quỹ</option><option value="stock">Cổ phiếu</option><option value="coin">Coin</option>
            <option value="gold">Vàng</option><option value="cash">Tiền mặt / không kỳ hạn</option><option value="other">Khác</option>
          </select>
        </label>
        <label className="f">Tên / mã<input id="h_name" required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="E1VFVN30, BTC, SJC…" /></label>
        <label className="f">Nơi giữ<input id="h_place" list="instList" value={f.place} onChange={(e) => set("place", e.target.value)} placeholder="SSI, Binance, PNJ…" /></label>
        <label className="f">{cash ? "Số dư (₫)" : "Số lượng"}<input id="h_qty" type="number" step="any" min="0" required value={f.qty} onChange={(e) => set("qty", e.target.value)} /></label>
        {!cash && <>
          <label className="f">Đơn vị<input id="h_unit" value={f.unit} onChange={(e) => set("unit", e.target.value)} placeholder="CCQ, BTC, chỉ, lượng…" /></label>
          <label className="f">Tổng vốn đã bỏ (₫)<MoneyInput id="h_cost" required value={f.cost} onChange={(v) => set("cost", v)} /></label>
          <label className="f">Giá hiện tại / đơn vị (₫)<MoneyInput id="h_price" required value={f.price} onChange={(v) => set("price", v)} /></label>
        </>}
        {f.type === "coin" && (
          <label className="f">Tự lấy giá (CoinGecko id) <span className="hint">để trống = nhập tay</span>
            <input id="h_coin" list="coinList" value={f.coinId} onChange={(e) => set("coinId", e.target.value)} placeholder="bitcoin" />
            <datalist id="coinList">{COINS.map(([id, s]) => <option key={id} value={id}>{s}</option>)}</datalist>
          </label>
        )}
        <label className="f full">Ghi chú<input id="h_note" value={f.note} onChange={(e) => set("note", e.target.value)} /></label>
      </div>
      <div className="calc">
        <div className="row"><span>Giá vốn trung bình</span><span className="num">{qty && !cash ? money(cost / qty) : "–"}</span></div>
        <div className="row"><span>Giá trị hiện tại</span><span className="num">{money(value)}</span></div>
        {!cash && <div className="row total"><span>Lãi / lỗ</span><span className={`num ${value - cost >= 0 ? "pos" : "neg"}`}>{signed(value - cost)}</span></div>}
      </div>
      <div className="dlg-actions">
        {draft.id && <button type="button" className="btn ghost danger left" onClick={() => setConfirmDel(true)}>Xoá</button>}
        <button type="button" className="btn" onClick={onClose}>Huỷ</button>
        <button type="button" className="btn primary" disabled={!f.name.trim() || busy} onClick={submit}>{busy ? "Đang lưu…" : "Lưu"}</button>
      </div>
      <Confirm open={confirmDel} title="Xoá tài sản?" text={`Xoá ${f.name}. Không hoàn tác được.`} okLabel="Xoá"
        onClose={() => setConfirmDel(false)} onOk={async () => { await onDelete(draft.id!); onClose(); }} />
    </>
  );
}

export type { Holding };
