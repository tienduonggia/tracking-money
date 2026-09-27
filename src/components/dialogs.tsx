"use client";
import { useMemo, useState } from "react";
import type { Deposit, DepositInput, Holding, HoldingInput, HoldingTxn, HoldingType, MarketPrice, MarketPriceInput, Tier } from "@/lib/types.ts";
import { GOLD_CODES } from "@/lib/gold.ts";
import {
  PRESETS, capitalOf, position, accrued, addMonths, days, dstr, earlyInterest, effectiveRate, expGross, fd, fmt2, money, netClosed, pd, segments, signed,
  termDays, today,
} from "@/lib/calc.ts";
import { Modal, MoneyInput, Confirm } from "./ui.tsx";

const TERMS = [...Array.from({ length: 24 }, (_, i) => i + 1), 36, 48, 60]; // 1–24 tháng + dài hạn

/* ======================= Deposit ======================= */
export type DepositDraft = Partial<DepositInput> & { id?: string };

/** Sổ mới lấy tiền từ tài khoản tiền mặt nào (id holding) — undefined = tiền mới bỏ thêm. */
export type DepositSave = (id: string | undefined, x: DepositInput, fundFrom?: string) => Promise<boolean>;

export function DepositDialog({ draft, institutions, cashAccounts, onClose, onSave, onDelete }: {
  draft: DepositDraft | null; // null = đóng
  institutions: string[];
  cashAccounts: Holding[];
  onClose: () => void;
  onSave: DepositSave;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <Modal open={!!draft} onClose={onClose}>
      {draft && <DepositForm key={draft.id ?? "new"} draft={draft} institutions={institutions} cashAccounts={cashAccounts} onClose={onClose} onSave={onSave} onDelete={onDelete} />}
    </Modal>
  );
}

type RateMode = "flat" | "tiered";
type TierRow = { upToMonth: string; rate: string };

function DepositForm({ draft, institutions, cashAccounts, onClose, onSave, onDelete }: {
  draft: DepositDraft; institutions: string[]; cashAccounts: Holding[]; onClose: () => void;
  onSave: DepositSave; onDelete: (id: string) => Promise<void>;
}) {
  void institutions;
  const open0 = draft.openDate ?? fd(today());
  const term0 = draft.termMonths ?? 6;
  const [f, setF] = useState({
    institution: draft.institution ?? "",
    label: draft.label ?? "",
    principal: (draft.principal ?? null) as number | null,
    rate: draft.rate !== undefined && !draft.tiers ? String(draft.rate) : "",
    openDate: open0,
    termMonths: TERMS.includes(term0) ? term0 : 0,
    maturityDate: draft.maturityDate ?? addMonths(open0, term0 || 6),
    earlyRate: String(draft.earlyRate ?? 0.5),
    taxPct: String(draft.taxPct ?? 0),
    note: draft.note ?? "",
  });
  const [mode, setMode] = useState<RateMode>(draft.tiers?.length ? "tiered" : "flat");
  const [rows, setRows] = useState<TierRow[]>(
    (draft.tiers ?? [{ upToMonth: 3, rate: 0 }]).map((t) => ({ upToMonth: String(t.upToMonth), rate: t.rate ? String(t.rate) : "" })),
  );
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  // Vốn mới: sổ mới tự tính; sửa sổ cũ thì hiện giá trị đang có, cho sửa tay
  const [rolled0] = useState(draft.principal ?? 0);
  const [newMoneyManual, setNewMoneyManual] = useState<number | null>(draft.id ? capitalOf({ newMoney: draft.newMoney ?? null, renewedFrom: draft.renewedFrom ?? null, principal: draft.principal ?? 0 }) : null);
  // Nguồn tiền: chỉ hỏi khi mở sổ mới không phải tái tục (tái tục lấy tiền từ sổ cũ)
  const askSource = !draft.id && !draft.renewedFrom && cashAccounts.length > 0;
  const [src, setSrc] = useState<string>(() => {
    const same = cashAccounts.find((h) => h.place.toLowerCase() === (draft.institution ?? "").toLowerCase());
    return same?.id ?? "new";
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const setOpen = (v: string) => setF((p) => ({ ...p, openDate: v, maturityDate: p.termMonths && v ? addMonths(v, p.termMonths) : p.maturityDate }));
  const setTerm = (m: number) => setF((p) => ({ ...p, termMonths: m, maturityDate: m && p.openDate ? addMonths(p.openDate, m) : p.maturityDate }));

  const applyPreset = (key: string) => {
    if (key === "flat" || key === "tiered") { setMode(key); return; }
    const pr = PRESETS.find((x) => x.key === key);
    if (!pr) return;
    setMode("tiered");
    setRows(pr.tiers.map((t) => ({ upToMonth: String(t.upToMonth), rate: String(t.rate) })));
    setF((p) => ({
      ...p, taxPct: String(pr.taxPct), earlyRate: String(pr.earlyRate),
      institution: p.institution || pr.institution, note: p.note || pr.note,
    }));
  };
  const updRow = (i: number, k: keyof TierRow, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  // Chuẩn hoá bậc: mốc tăng dần, lãi > 0
  const tiers: Tier[] | null = useMemo(() => {
    if (mode !== "tiered") return null;
    const t = rows.map((r) => ({ upToMonth: Math.round(Number(r.upToMonth)), rate: Number(r.rate) }));
    let prev = 0;
    for (const x of t) { if (!(x.upToMonth > prev) || !(x.rate > 0)) return null; prev = x.upToMonth; }
    return t.length ? t : null;
  }, [mode, rows]);

  const principal = f.principal ?? 0, taxPct = Number(f.taxPct) || 0;
  const maturityDate = tiers && f.openDate ? addMonths(f.openDate, tiers[tiers.length - 1].upToMonth) : f.maturityDate;
  const terms = { principal, rate: Number(f.rate) || 0, openDate: f.openDate, maturityDate, tiers };
  const valid = principal > 0 && !!f.openDate && !!maturityDate && pd(maturityDate) > pd(f.openDate)
    && (mode === "tiered" ? !!tiers : terms.rate > 0);
  const g = valid ? expGross(terms) : 0;
  const tax = (g * taxPct) / 100;
  const segs = valid && tiers ? segments(terms) : [];
  const srcAcc = askSource && src !== "new" ? cashAccounts.find((h) => h.id === src) : undefined;
  // Tiền quay vòng: lấy từ tiền chờ (tối đa số dư) hoặc gốc chuyển sang khi tái tục
  const fromCash = srcAcc ? Math.min(principal, srcAcc.qty) : 0;
  const recycled = draft.id ? 0 : fromCash + (draft.renewedFrom ? rolled0 : 0);
  const autoNew = Math.max(0, principal - recycled);
  const newMoney = newMoneyManual ?? autoNew;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    const base: DepositInput = {
      institution: f.institution.trim(), label: f.label.trim(), principal,
      rate: tiers ? Math.round(effectiveRate(terms) * 1000) / 1000 : terms.rate, tiers,
      termMonths: tiers ? tiers[tiers.length - 1].upToMonth : f.termMonths,
      openDate: f.openDate, maturityDate, earlyRate: Number(f.earlyRate) || 0, taxPct, note: f.note.trim(),
      status: draft.status ?? "active", closeDate: draft.closeDate ?? null, closeType: draft.closeType ?? null,
      interest: draft.interest ?? null, tax: draft.tax ?? null, fee: draft.fee ?? null, renewedFrom: draft.renewedFrom ?? null,
      payout: draft.payout ?? null, newMoney: Math.min(principal, newMoney),
    };
    const ok = await onSave(draft.id, base, srcAcc?.id);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <>
      <h3>{draft.id ? "Sửa sổ tiết kiệm" : "Thêm sổ tiết kiệm"}</h3>
      <div className="fields">
        <label className="f full">Kiểu lãi
          <select id="d_mode" value={mode} onChange={(e) => applyPreset(e.target.value)}>
            <option value="flat">Cố định (sổ ngân hàng thường)</option>
            <option value="tiered">Bậc thang theo thời gian giữ (tự nhập)</option>
            {PRESETS.map((p) => <option key={p.key} value={p.key}>Mẫu: {p.label}</option>)}
          </select>
        </label>
        <label className="f">Nơi gửi
          <input id="d_inst" list="instList" required value={f.institution} onChange={(e) => set("institution", e.target.value)} placeholder="MB Bank, Timo, Topi…" />
        </label>
        <label className="f">Tên sổ <span className="hint">(tuỳ chọn)</span>
          <input id="d_label" value={f.label} onChange={(e) => set("label", e.target.value)} placeholder="Quỹ khẩn cấp" />
        </label>
        <label className="f">Số tiền gốc (₫)
          <MoneyInput id="d_principal" required value={f.principal} onChange={(v) => set("principal", v)} placeholder="50.000.000" />
        </label>
        <label className="f">Ngày gửi
          <input id="d_open" type="date" required value={f.openDate} onChange={(e) => setOpen(e.target.value)} />
        </label>
        {mode === "flat" ? (
          <>
            <label className="f">Lãi suất (%/năm)
              <input id="d_rate" type="number" step="0.01" min="0" required value={f.rate} onChange={(e) => set("rate", e.target.value)} placeholder="5.2" />
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
          </>
        ) : (
          <div className="f full tiers">
            <div className="tiers-head"><span>Đến hết tháng thứ</span><span>Lãi suất (%/năm)</span><span /></div>
            {rows.map((r, i) => (
              <div className="tier-row" key={i}>
                <span className="note">{i === 0 ? "Từ tháng 0" : `Từ tháng ${rows[i - 1].upToMonth || "?"}`} →</span>
                <input id={`t_m${i}`} aria-label={`Bậc ${i + 1}: đến tháng`} type="number" min="1" step="1" value={r.upToMonth} onChange={(e) => updRow(i, "upToMonth", e.target.value)} />
                <input id={`t_r${i}`} aria-label={`Bậc ${i + 1}: lãi suất`} type="number" min="0" step="0.01" value={r.rate} onChange={(e) => updRow(i, "rate", e.target.value)} placeholder="6.6" />
                <button type="button" className="btn small ghost" aria-label="Xoá bậc" disabled={rows.length === 1} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button type="button" className="btn small" disabled={rows.length >= 12}
              onClick={() => setRows((x) => [...x, { upToMonth: String((Number(x[x.length - 1]?.upToMonth) || 0) + 3), rate: "" }])}>+ Thêm bậc</button>
            <span className="note">Đáo hạn: {dstr(maturityDate)} · Rút trước hạn: giữ lãi các bậc đã xong, phần ngày của bậc đang dở tính lãi không kỳ hạn.</span>
          </div>
        )}
        <label className="f">Lãi không kỳ hạn (%/năm) <span className="hint">áp khi rút trước hạn</span>
          <input id="d_early" type="number" step="0.01" min="0" value={f.earlyRate} onChange={(e) => set("earlyRate", e.target.value)} />
        </label>
        <label className="f">Thuế trên lãi (%) <span className="hint">ngân hàng: 0 · fintech: 5</span>
          <input id="d_tax" type="number" step="0.01" min="0" value={f.taxPct} onChange={(e) => set("taxPct", e.target.value)} />
        </label>
        {askSource && (
          <label className="f full">Nguồn tiền
            <select id="d_src" value={src} onChange={(e) => setSrc(e.target.value)}>
              {cashAccounts.map((h) => <option key={h.id} value={h.id}>Lấy từ tiền mặt: {h.name}{h.place ? ` · ${h.place}` : ""} (đang có {money(h.qty)})</option>)}
              <option value="new">Tiền mới bỏ thêm (không trừ tiền mặt)</option>
            </select>
            {srcAcc && (
              <span className="hint">
                {principal > srcAcc.qty
                  ? `Lấy hết ${money(srcAcc.qty)} từ ${srcAcc.name}, phần còn lại ${money(principal - srcAcc.qty)} tính là vốn mới.`
                  : `Sau khi mở sổ, ${srcAcc.name} còn ${money(srcAcc.qty - principal)}. Tổng tài sản không đổi.`}
              </span>
            )}
          </label>
        )}
        <label className="f">Trong đó vốn mới bỏ vào (₫) <span className="hint">{draft.id ? "sửa nếu chưa đúng" : newMoneyManual === null ? "tự tính" : "đã sửa tay"}</span>
          <MoneyInput id="d_newmoney" value={newMoney} onChange={(v) => setNewMoneyManual(v === null ? null : Math.min(v, principal))} />
        </label>
        <label className="f full">Ghi chú
          <input id="d_note" value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Online, tái tục gốc…" />
        </label>
      </div>
      <div className="calc">
        {valid ? (
          <>
            {segs.map((sg, i) => (
              <div className="row" key={i}>
                <span>Tháng {sg.fromMonth}–{sg.toMonth} · {fmt2(sg.rate)}% · {days(sg.start, sg.end)} ngày</span>
                <span className="num">{money(accrued(terms, sg.end) - accrued(terms, sg.start))}</span>
              </div>
            ))}
            <div className="row"><span>Số ngày gửi</span><span className="num">{termDays({ openDate: f.openDate, maturityDate })} ngày</span></div>
            <div className="row"><span>Lãi dự kiến{tiers ? ` (bình quân ${fmt2(effectiveRate(terms))}%/năm)` : " (gốc × LS × ngày / 365)"}</span><span className="num">{money(g)}</span></div>
            {tax > 0 && <div className="row"><span>Thuế {taxPct}%</span><span className="num">−{money(tax)}</span></div>}
            <div className="row total"><span>Nhận khi đáo hạn</span><span className="num">{money(principal + g - tax)}</span></div>
          </>
        ) : <span className="note">{mode === "tiered" ? "Nhập gốc, ngày gửi và các bậc (mốc tháng tăng dần, lãi > 0) để xem lãi dự kiến." : "Nhập gốc, lãi suất và ngày (đáo hạn sau ngày gửi) để xem lãi dự kiến."}</span>}
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
/** Tiền nhận về chuyển vào đâu: không ghi / cộng vào tài sản tiền mặt có sẵn / tạo tài khoản tiền mặt mới. */
export type Payout = { dest: "none" } | { dest: "existing"; holdingId: string; amount: number } | { dest: "new"; name: string; place: string; amount: number };

export function CloseDialog({ deposit, cashAccounts, onClose, onConfirm }: {
  deposit: Deposit | null;
  cashAccounts: Holding[];
  onClose: () => void;
  onConfirm: (d: Deposit, x: DepositInput, roll: Rollover, payout: Payout) => Promise<boolean>;
}) {
  return (
    <Modal open={!!deposit} onClose={onClose}>
      {deposit && <CloseForm key={deposit.id} d={deposit} cashAccounts={cashAccounts} onClose={onClose} onConfirm={onConfirm} />}
    </Modal>
  );
}

/* ---------- Chọn nơi ghi tiền nhận về (dùng khi tất toán và khi ghi bù sổ cũ) ---------- */
function defaultDest(d: Deposit, cashAccounts: Holding[]) {
  const same = cashAccounts.find((h) => h.place.toLowerCase() === d.institution.toLowerCase());
  return same?.id ?? (cashAccounts[0]?.id || "new");
}
function toPayout(d: Deposit, dest: string, amount: number): Payout {
  if (amount <= 0 || dest === "none") return { dest: "none" };
  if (dest === "new") return { dest: "new", name: `Tài khoản ${d.institution}`, place: d.institution, amount };
  return { dest: "existing", holdingId: dest, amount };
}
function DestSelect({ id, d, value, onChange, cashAccounts, noneLabel }: {
  id: string; d: Deposit; value: string; onChange: (v: string) => void; cashAccounts: Holding[]; noneLabel: string;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {cashAccounts.map((h) => <option key={h.id} value={h.id}>{h.name}{h.place ? ` · ${h.place}` : ""} (đang có {money(h.qty)})</option>)}
      <option value="new">+ Tạo tài khoản tiền mặt mới: Tài khoản {d.institution}</option>
      <option value="none">{noneLabel}</option>
    </select>
  );
}

/** Ghi bù tiền nhận về cho sổ đã tất toán trước khi có tính năng. */
export function PayoutDialog({ deposit, cashAccounts, onClose, onConfirm }: {
  deposit: Deposit | null; cashAccounts: Holding[]; onClose: () => void;
  onConfirm: (d: Deposit, payout: Payout) => Promise<boolean>;
}) {
  return (
    <Modal open={!!deposit} onClose={onClose}>
      {deposit && <PayoutForm key={deposit.id} d={deposit} cashAccounts={cashAccounts} onClose={onClose} onConfirm={onConfirm} />}
    </Modal>
  );
}
function PayoutForm({ d, cashAccounts, onClose, onConfirm }: {
  d: Deposit; cashAccounts: Holding[]; onClose: () => void; onConfirm: (d: Deposit, payout: Payout) => Promise<boolean>;
}) {
  const received = d.principal + netClosed(d);
  const [amount, setAmount] = useState<number | null>(Math.round(received));
  const [dest, setDest] = useState(defaultDest(d, cashAccounts));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const ok = await onConfirm(d, toPayout(d, dest, amount || 0));
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <>
      <h3>Ghi tiền nhận về</h3>
      <div className="note">{d.institution}{d.label ? ` · ${d.label}` : ""} · tất toán {dstr(d.closeDate)} · nhận về {money(received)}</div>
      <div className="fields">
        <label className="f full">Tiền nhận về hiện còn đâu?
          <DestSelect id="p_dest" d={d} value={dest} onChange={setDest} cashAccounts={cashAccounts} noneLabel="Đã tiêu / đã chuyển sang sổ hoặc tài sản khác (không ghi)" />
        </label>
        {dest !== "none" && (
          <label className="f full">Số tiền cộng vào (₫) <span className="hint">sửa nếu đã tiêu bớt một phần</span>
            <MoneyInput id="p_amount" value={amount} onChange={setAmount} />
          </label>
        )}
      </div>
      <p className="note" style={{ margin: 0 }}>
        {dest === "none" ? "Sổ sẽ được đánh dấu đã xử lý, tổng tài sản không đổi." : `Tổng tài sản sẽ tăng ${money(amount || 0)} ở mục Tiền mặt.`}
      </p>
      <div className="dlg-actions">
        <button type="button" className="btn" onClick={onClose}>Huỷ</button>
        <button type="button" className="btn primary" disabled={busy || (dest !== "none" && !(amount && amount > 0))} onClick={submit}>{busy ? "Đang lưu…" : dest === "none" ? "Đánh dấu đã xử lý" : "Ghi vào tiền mặt"}</button>
      </div>
    </>
  );
}

function suggested(d: Deposit, date: string) {
  const c = pd(date);
  const early = c < pd(d.maturityDate);
  const gi = early ? earlyInterest(d, c) : expGross(d);
  return { early, gi, tax: (gi * (d.taxPct || 0)) / 100 };
}

function CloseForm({ d, cashAccounts, onClose, onConfirm }: {
  d: Deposit; cashAccounts: Holding[]; onClose: () => void;
  onConfirm: (d: Deposit, x: DepositInput, roll: Rollover, payout: Payout) => Promise<boolean>;
}) {
  const t = today();
  const m = pd(d.maturityDate);
  const [date, setDate] = useState(fd(t >= m ? m : Math.max(t, pd(d.openDate) + 86_400_000)));
  const s0 = suggested(d, date);
  const [gi, setGi] = useState<number | null>(Math.round(s0.gi));
  const [tax, setTax] = useState<number | null>(Math.round(s0.tax));
  const [fee, setFee] = useState<number | null>(0);
  const [roll, setRoll] = useState<Rollover>("none");
  // Mặc định chuyển vào tài khoản tiền mặt cùng nơi gửi nếu có, không thì tạo mới
  const [dest, setDest] = useState<string>(defaultDest(d, cashAccounts));
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
  // Tiền thực sự về tài khoản: không tái tục = gốc + lãi ròng; tái tục gốc = lãi ròng; tái tục cả = 0
  const payoutAmount = roll === "none" ? d.principal + net : roll === "principal" ? net : 0;
  const payout = toPayout(d, dest, payoutAmount);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    const { id: _id, ...rest } = d;
    void _id;
    const ok = await onConfirm(d, {
      ...rest, status: "closed", closeDate: date, closeType: s.early ? "early" : "matured",
      interest: gi || 0, tax: tax || 0, fee: fee || 0, payout: payout.dest === "none" ? "none" : "cash",
    }, roll, payout);
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
        {payoutAmount > 0 && (
          <label className="f full">Tiền nhận về ({money(payoutAmount)}) chuyển vào
            <DestSelect id="c_dest" d={d} value={dest} onChange={setDest} cashAccounts={cashAccounts} noneLabel="Không ghi (tiền đã tiêu / chuyển đi nơi khác)" />
            <span className="hint">Để tổng tài sản không bị tụt: số tiền này cộng vào tài sản Tiền mặt ở tab Đầu tư.</span>
          </label>
        )}
      </div>
      <div className="calc">
        <div className="row"><span>Gửi {held} ngày · lãi gợi ý {s.early ? (d.tiers ? `(giữ lãi các bậc đã xong, bậc dở ${fmt2(d.earlyRate)}%)` : `(LS không kỳ hạn ${fmt2(d.earlyRate)}%)`) : ""}</span><span className="num">{money(s.gi)}</span></div>
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
  const term = d.tiers?.length ? d.tiers[d.tiers.length - 1].upToMonth : d.termMonths || 6;
  return {
    institution: d.institution, label: d.label, principal: Math.round(p), rate: d.rate, tiers: d.tiers, openDate: closed.closeDate!,
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

export function HoldingDialog({ draft, places, markets, onClose, onSave, onDelete, onCreateMarket }: {
  draft: HoldingDraft | null; places: string[]; markets: MarketPrice[]; onClose: () => void;
  onSave: (id: string | undefined, x: HoldingInput) => Promise<boolean>; onDelete: (id: string) => Promise<void>;
  onCreateMarket: (x: MarketPriceInput) => Promise<MarketPrice | null>;
}) {
  return (
    <Modal open={!!draft} onClose={onClose}>
      {draft && <HoldingForm key={draft.id ?? "new"} draft={draft} places={places} markets={markets} onClose={onClose} onSave={onSave} onDelete={onDelete} onCreateMarket={onCreateMarket} />}
    </Modal>
  );
}

/** Tài sản nhập kiểu cũ (chưa có lịch sử) → một lần mua "số dư ban đầu". */
export function legacyTxns(h: Pick<Holding, "qty" | "cost" | "priceDate" | "txns">): HoldingTxn[] {
  if (h.txns?.length) return h.txns;
  if (!(h.qty > 0)) return [];
  return [{ id: "init", date: h.priceDate || fd(today()), kind: "buy", qty: h.qty, price: h.cost / h.qty, fee: 0, note: "Số dư ban đầu" }];
}
const tid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function HoldingForm({ draft, markets, onClose, onSave, onDelete, onCreateMarket }: {
  draft: HoldingDraft; places: string[]; markets: MarketPrice[]; onClose: () => void;
  onSave: (id: string | undefined, x: HoldingInput) => Promise<boolean>; onDelete: (id: string) => Promise<void>;
  onCreateMarket: (x: MarketPriceInput) => Promise<MarketPrice | null>;
}) {
  const src = draft.priceSource ?? "";
  const [f, setF] = useState({
    type: (draft.type ?? "gold") as HoldingType,
    name: draft.name ?? "",
    place: draft.place ?? "",
    qty: draft.qty !== undefined ? String(draft.qty) : "",
    unit: draft.unit ?? (draft.type ? "" : "chỉ"),
    cost: (draft.cost ?? null) as number | null,
    price: (draft.price ?? null) as number | null,
    coinId: src.startsWith("coingecko:") ? src.slice(10) : "",
    goldCode: src.startsWith("vangtoday:") ? src.split(":")[1] : "",
    note: draft.note ?? "",
    // mua lần đầu (tài sản mới)
    buyDate: fd(today()), buyQty: "", buyPrice: null as number | null, buyFee: null as number | null,
  });
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  // Giá theo: key của Giá thị trường | "__new" (tạo loại giá mới) | "" (giá riêng nhập tay)
  const [link, setLink] = useState<string>(draft.id ? draft.priceKey ?? "" : "__new");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const cash = f.type === "cash";
  const isNew = !draft.id;
  const market = markets.find((m) => m.key === link);
  const hasTxns = !!draft.txns?.length;
  const legacy = !isNew && !hasTxns && !cash;

  // Vị thế hiển thị
  const newTxns: HoldingTxn[] = isNew && !cash && Number(f.buyQty) > 0 && f.buyPrice
    ? [{ id: tid(), date: f.buyDate, kind: "buy", qty: Number(f.buyQty), price: f.buyPrice, fee: f.buyFee || 0, note: "Mua lần đầu" }] : [];
  const txns = hasTxns ? draft.txns! : newTxns;
  const pos = txns.length ? position(txns) : null;
  const qty = cash ? Number(f.qty) || 0 : pos ? pos.qty : Number(f.qty) || 0;
  const cost = cash ? qty : pos ? pos.cost : f.cost || 0;
  const price = cash ? 1 : market ? market.price : link === "__new" ? f.price ?? f.buyPrice ?? 0 : f.price ?? (isNew ? f.buyPrice ?? 0 : 0);
  const value = qty * price;
  const unitKey = f.unit.trim().toLowerCase() === "lượng" ? "luong" : "chi";
  const newSource = f.type === "coin" && f.coinId.trim() ? `coingecko:${f.coinId.trim().toLowerCase()}`
    : f.type === "gold" && f.goldCode ? `vangtoday:${f.goldCode}:${unitKey}` : "";
  const valid = f.name.trim() && (cash ? qty >= 0 : isNew ? newTxns.length > 0 : true);

  const submit = async () => {
    setBusy(true);
    let key = cash ? "" : link === "__new" ? "" : link;
    let p = price;
    const same = markets.find((m) => m.label.trim().toLowerCase() === f.name.trim().toLowerCase());
    if (!cash && link === "__new" && same) { key = same.key; p = same.price; } // đã có loại giá cùng tên → dùng chung
    else if (!cash && link === "__new") {
      // Tạo dòng Giá thị trường mới, giá ban đầu = giá nhập (hoặc giá mua) cho tới khi cập nhật tự động
      const m = await onCreateMarket({ key: "", label: f.name.trim(), unit: f.unit.trim(), source: newSource, price: p, priceDate: fd(today()) });
      if (!m) { setBusy(false); return; }
      key = m.key; p = m.price;
    }
    const priceChanged = isNew || draft.price !== p;
    const ok = await onSave(draft.id, {
      type: f.type, name: f.name.trim(), place: f.place.trim(), qty, unit: cash ? "₫" : f.unit.trim(), cost, price: p,
      priceDate: priceChanged ? fd(today()) : draft.priceDate ?? null,
      priceSource: "", priceKey: key, note: f.note.trim(), txns: cash ? [] : txns,
    });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <>
      <h3>{draft.id ? "Sửa tài sản" : "Thêm tài sản"}</h3>
      <div className="fields">
        <label className="f">Loại
          <select id="h_type" value={f.type} disabled={!isNew} onChange={(e) => { const t = e.target.value as HoldingType; setF((p) => ({ ...p, type: t, unit: t === "gold" ? "chỉ" : p.unit === "chỉ" ? "" : p.unit })); }}>
            <option value="gold">Vàng</option><option value="etf">ETF / Chứng chỉ quỹ</option><option value="stock">Cổ phiếu</option>
            <option value="coin">Coin</option><option value="cash">Tiền mặt / tiền chờ</option><option value="other">Khác</option>
          </select>
        </label>
        <label className="f">Tên / mã<input id="h_name" required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={f.type === "gold" ? "Nhẫn DOJI HTV" : "E1VFVN30, BTC…"} /></label>
        <label className="f">Nơi giữ<input id="h_place" list="instList" value={f.place} onChange={(e) => set("place", e.target.value)} placeholder="DOJI, SSI, Binance…" /></label>
        {cash ? (
          <label className="f">Số dư (₫)<input id="h_qty" type="number" step="any" min="0" value={f.qty} onChange={(e) => set("qty", e.target.value)} /></label>
        ) : f.type === "gold" ? (
          <label className="f">Đơn vị
            <select id="h_unit" value={f.unit || "chỉ"} onChange={(e) => set("unit", e.target.value)}><option value="chỉ">chỉ</option><option value="lượng">lượng</option></select>
          </label>
        ) : (
          <label className="f">Đơn vị<input id="h_unit" value={f.unit} onChange={(e) => set("unit", e.target.value)} placeholder="CCQ, BTC, cp…" /></label>
        )}
        {isNew && !cash && <>
          <label className="f">Ngày mua<input id="h_bdate" type="date" value={f.buyDate} onChange={(e) => set("buyDate", e.target.value)} /></label>
          <label className="f">Số lượng mua<input id="h_bqty" type="number" step="any" min="0" value={f.buyQty} onChange={(e) => set("buyQty", e.target.value)} /></label>
          <label className="f">Giá mua / {f.unit || "đơn vị"} (₫)<MoneyInput id="h_bprice" value={f.buyPrice} onChange={(v) => set("buyPrice", v)} /></label>
          <label className="f">Phí mua (₫) <span className="hint">tuỳ chọn</span><MoneyInput id="h_bfee" value={f.buyFee} onChange={(v) => set("buyFee", v)} /></label>
        </>}
        {legacy && <>
          <label className="f">Số lượng<input id="h_qty" type="number" step="any" min="0" value={f.qty} onChange={(e) => set("qty", e.target.value)} /></label>
          <label className="f">Tổng vốn đã bỏ (₫)<MoneyInput id="h_cost" value={f.cost} onChange={(v) => set("cost", v)} /></label>
        </>}
        {!cash && (
          <label className="f full">Giá thị trường theo
            <select id="h_link" value={link} onChange={(e) => setLink(e.target.value)}>
              {markets.map((m) => <option key={m.key} value={m.key}>{m.label}: {money(m.price)}{m.unit ? `/${m.unit}` : ""}</option>)}
              <option value="__new">+ Loại giá mới: {f.name.trim() || "…"}</option>
              <option value="">Giá riêng cho tài sản này (nhập tay)</option>
            </select>
            <span className="hint">Mọi tài sản cùng loại dùng chung một giá ở bảng Giá thị trường (tab Đầu tư).</span>
          </label>
        )}
        {!cash && link === "__new" && f.type === "gold" && (
          <label className="f full">Tự lấy giá (vang.today, giá tiệm mua vào)
            <select id="h_gold" value={f.goldCode} onChange={(e) => set("goldCode", e.target.value)}>
              <option value="">Không, nhập tay ở bảng Giá thị trường</option>
              {GOLD_CODES.map((g) => <option key={g.code} value={g.code}>{g.label}</option>)}
            </select>
          </label>
        )}
        {!cash && link === "__new" && f.type === "coin" && (
          <label className="f">Tự lấy giá (CoinGecko id) <span className="hint">để trống = nhập tay</span>
            <input id="h_coin" list="coinList" value={f.coinId} onChange={(e) => set("coinId", e.target.value)} placeholder="bitcoin" />
            <datalist id="coinList">{COINS.map(([id, s]) => <option key={id} value={id}>{s}</option>)}</datalist>
          </label>
        )}
        {!cash && link === "" && (
          <label className="f">Giá hiện tại / {f.unit || "đơn vị"} (₫)
            <MoneyInput id="h_price" value={f.price} onChange={(v) => set("price", v)} placeholder={isNew && f.buyPrice ? fmt2(f.buyPrice) : ""} />
          </label>
        )}
        <label className="f full">Ghi chú<input id="h_note" value={f.note} onChange={(e) => set("note", e.target.value)} /></label>
      </div>
      {hasTxns && <p className="note" style={{ margin: 0 }}>Số lượng và vốn tính từ lịch sử mua bán. Thêm lần mua / bán bằng nút Mua, Bán ở bảng Đầu tư.</p>}
      {legacy && <p className="note" style={{ margin: 0 }}>Tài sản nhập kiểu cũ. Lần Mua / Bán tiếp theo sẽ tự chuyển số hiện có thành "số dư ban đầu".</p>}
      <div className="calc">
        {!cash && <div className="row"><span>Đang giữ</span><span className="num">{fmt2(qty)} {f.unit}</span></div>}
        {!cash && <div className="row"><span>Giá vốn trung bình</span><span className="num">{qty ? money(cost / qty) : "–"}</span></div>}
        <div className="row"><span>Giá trị hiện tại</span><span className="num">{money(value)}</span></div>
        {!cash && <div className="row total"><span>Lời / lỗ chưa chốt</span><span className={`num ${value - cost >= 0 ? "pos" : "neg"}`}>{signed(value - cost)}</span></div>}
      </div>
      <div className="dlg-actions">
        {draft.id && <button type="button" className="btn ghost danger left" onClick={() => setConfirmDel(true)}>Xoá</button>}
        <button type="button" className="btn" onClick={onClose}>Huỷ</button>
        <button type="button" className="btn primary" disabled={!valid || busy} onClick={submit}>{busy ? "Đang lưu…" : "Lưu"}</button>
      </div>
      <Confirm open={confirmDel} title="Xoá tài sản?" text={`Xoá ${f.name} cùng lịch sử mua bán. Không hoàn tác được.`} okLabel="Xoá"
        onClose={() => setConfirmDel(false)} onOk={async () => { await onDelete(draft.id!); onClose(); }} />
    </>
  );
}

/* ======================= Mua / Bán thêm ======================= */
export function HoldingTxnDialog({ target, onClose, onSave }: {
  target: { h: Holding; kind: "buy" | "sell"; edit?: HoldingTxn } | null; onClose: () => void;
  onSave: (h: Holding, txns: HoldingTxn[]) => Promise<boolean>;
}) {
  return (
    <Modal open={!!target} onClose={onClose}>
      {target && <HoldingTxnForm key={target.h.id + target.kind + (target.edit?.id ?? "")} h={target.h} kind={target.kind} edit={target.edit} onClose={onClose} onSave={onSave} />}
    </Modal>
  );
}

function HoldingTxnForm({ h, kind, edit, onClose, onSave }: { h: Holding; kind: "buy" | "sell"; edit?: HoldingTxn; onClose: () => void; onSave: (h: Holding, txns: HoldingTxn[]) => Promise<boolean> }) {
  // Sửa giao dịch cũ: bỏ nó ra khỏi danh sách rồi ghi lại bản mới cùng id
  const base = legacyTxns(h).filter((x) => x.id !== edit?.id);
  const before = position(base);
  const [date, setDate] = useState(edit?.date ?? fd(today()));
  const [qty, setQty] = useState(edit ? String(edit.qty) : "");
  const [price, setPrice] = useState<number | null>(edit ? edit.price : h.price || null);
  const [fee, setFee] = useState<number | null>(edit?.fee || null);
  const [busy, setBusy] = useState(false);
  const q = Number(qty) || 0;
  const txn: HoldingTxn = { id: edit?.id ?? tid(), date, kind, qty: q, price: price || 0, fee: fee || 0, note: edit?.note ?? "" };
  const after = q > 0 && price ? position([...base, txn]) : before;
  const over = kind === "sell" && q > before.qty + 1e-9;
  const valid = q > 0 && !!price && !!date && !over;
  const submit = async () => {
    setBusy(true);
    const ok = await onSave(h, [...base, txn]);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <>
      <h3>{edit ? `Sửa lần ${kind === "buy" ? "mua" : "bán"}` : kind === "buy" ? "Mua thêm" : "Bán"} · {h.name}</h3>
      <div className="note num">Đang giữ {fmt2(before.qty)} {h.unit} · giá vốn TB {money(before.avg)}</div>
      <div className="fields">
        <label className="f">Ngày<input id="t_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="f">Số lượng ({h.unit || "đơn vị"})
          <input id="t_qty" type="number" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
          {kind === "sell" && <button type="button" className="btn small ghost" style={{ justifySelf: "start" }} onClick={() => setQty(String(before.qty))}>Bán hết</button>}
        </label>
        <label className="f">Giá {kind === "buy" ? "mua" : "bán"} / {h.unit || "đơn vị"} (₫)<MoneyInput id="t_price" value={price} onChange={setPrice} /></label>
        <label className="f">Phí (₫) <span className="hint">tuỳ chọn</span><MoneyInput id="t_fee" value={fee} onChange={setFee} /></label>
      </div>
      <div className="calc">
        <div className="row"><span>{kind === "buy" ? "Tiền mua" : "Tiền thu về"}</span><span className="num">{money(kind === "buy" ? q * (price || 0) + (fee || 0) : q * (price || 0) - (fee || 0))}</span></div>
        {kind === "sell" && <div className="row total"><span>Lời / lỗ chốt lần này</span><span className={`num ${after.realized - before.realized >= 0 ? "pos" : "neg"}`}>{signed(after.realized - before.realized)}</span></div>}
        <div className="row"><span>Sau giao dịch</span><span className="num">{fmt2(after.qty)} {h.unit} · giá vốn TB {money(after.avg)}</span></div>
        {over && <div className="row neg"><span>Bán vượt số đang giữ</span><span /></div>}
      </div>
      <div className="dlg-actions">
        <button type="button" className="btn" onClick={onClose}>Huỷ</button>
        <button type="button" className="btn primary" disabled={!valid || busy} onClick={submit}>{busy ? "Đang lưu…" : edit ? "Lưu" : kind === "buy" ? "Ghi lần mua" : "Ghi lần bán"}</button>
      </div>
    </>
  );
}

export type { Holding };
