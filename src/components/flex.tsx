"use client";
import { useState } from "react";
import type { Compounding, FlexAccount, FlexInput, FlexTxn, FlexTxnKind, Holding } from "@/lib/types.ts";
import { dstr, fd, flexSim, fmt2, money, moneyS, pd, rateOn, today } from "@/lib/calc.ts";
import { Confirm, Modal, MoneyInput } from "./ui.tsx";

const COMP_LABEL: Record<Compounding, string> = {
  daily: "lãi nhập gốc hằng ngày",
  monthly: "lãi nhập gốc hằng tháng",
  none: "lãi trả khi rút",
};
const KIND_LABEL: Record<FlexTxnKind, string> = { deposit: "Nạp", withdraw: "Rút", adjust: "Điều chỉnh" };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Nguồn / đích tiền của một giao dịch: tiền mới / đem tiêu, hoặc một tài khoản tiền chờ. */
export type CashLink = { holdingId: string } | { newName: string; place: string } | null;

/* ======================= Danh sách thẻ ======================= */
export function FlexSection({ flex, t, onAdd, onEdit, onTxn }: {
  flex: FlexAccount[]; t: number;
  onAdd: () => void; onEdit: (f: FlexAccount) => void; onTxn: (f: FlexAccount, kind: FlexTxnKind) => void;
}) {
  const [openHist, setOpenHist] = useState<string | null>(null);
  return (
    <div className="flex-section">
      <div className="toolbar">
        <span className="eyebrow">Tích luỹ không kỳ hạn</span>
        <span className="note">{flex.length ? `${flex.length} tài khoản · ${money(flex.reduce((s, f) => s + flexSim(f, t).value, 0))}` : "Nạp rút lúc nào cũng được, lãi tính theo ngày"}</span>
        <button className="btn small" onClick={onAdd}>+ Tài khoản tích luỹ</button>
      </div>
      {flex.length > 0 && (
        <div className="books">
          {flex.map((f) => {
            const s = flexSim(f, t);
            const rate = rateOn(f, t);
            const perDay = (s.balance * rate) / 100 / 365 * (1 - (f.taxPct || 0) / 100);
            const netIn = s.inExt + s.inInt - s.outExt - s.outInt;
            const hist = [...f.txns].sort((a, b) => pd(b.date) - pd(a.date));
            return (
              <article className="book" key={f.id}>
                <div className="head">
                  <div><div className="inst">{f.institution}</div><div className="lab">{f.name || "Tích luỹ không kỳ hạn"}</div></div>
                  <span className="pill tier">{fmt2(rate)}%/năm</span>
                </div>
                <div className="amt num">{money(s.value)}</div>
                <dl className="num">
                  <div><dt>Lãi đã sinh ra</dt><dd className="pos">{money(s.interest)}</dd></div>
                  <div><dt>Lãi mỗi ngày (ước tính)</dt><dd>{money(perDay)}</dd></div>
                  <div><dt>Tiền gốc đang nằm trong</dt><dd>{money(netIn)}</dd></div>
                  <div><dt>Cách trả lãi</dt><dd>{COMP_LABEL[f.compounding]}{f.taxPct ? ` · thuế ${fmt2(f.taxPct)}%` : ""}</dd></div>
                </dl>
                {s.pending > 1 && f.compounding !== "daily" && <div className="note num">Trong đó lãi chưa nhập gốc: {money(s.pending)}</div>}
                {openHist === f.id && (
                  <div className="hist">
                    {hist.length ? hist.map((x) => (
                      <div className="hist-row num" key={x.id}>
                        <span>{dstr(x.date)}</span>
                        <span>{KIND_LABEL[x.kind]}{x.kind !== "adjust" ? (x.external ? (x.kind === "deposit" ? " · tiền mới" : " · đem tiêu") : " · nội bộ") : ""}</span>
                        <span className={x.kind === "withdraw" || x.amount < 0 ? "neg" : "pos"}>{x.kind === "withdraw" ? "−" : x.amount < 0 ? "" : "+"}{money(Math.abs(x.amount))}</span>
                      </div>
                    )) : <div className="empty">Chưa có giao dịch.</div>}
                    <div className="note">Lãi suất: {f.rates.map((r) => `${fmt2(r.rate)}% từ ${dstr(r.from)}`).join(" → ")}</div>
                  </div>
                )}
                <div className="foot">
                  <button className="btn small ghost" onClick={() => setOpenHist(openHist === f.id ? null : f.id)}>{openHist === f.id ? "Ẩn lịch sử" : "Lịch sử"}</button>
                  <button className="btn small ghost" onClick={() => onEdit(f)}>Sửa</button>
                  <button className="btn small ghost" onClick={() => onTxn(f, "adjust")}>Điều chỉnh</button>
                  <button className="btn small" onClick={() => onTxn(f, "withdraw")}>Rút</button>
                  <button className="btn small" onClick={() => onTxn(f, "deposit")}>Nạp</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ======================= Tạo / sửa tài khoản ======================= */
export function FlexDialog({ acc, cashAccounts, onClose, onSave, onDelete }: {
  acc: FlexAccount | "new" | null; cashAccounts: Holding[]; onClose: () => void;
  onSave: (id: string | undefined, x: FlexInput, link: CashLink) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <Modal open={!!acc} onClose={onClose}>
      {acc && <FlexForm key={acc === "new" ? "new" : acc.id} acc={acc === "new" ? null : acc} cashAccounts={cashAccounts} onClose={onClose} onSave={onSave} onDelete={onDelete} />}
    </Modal>
  );
}

function FlexForm({ acc, cashAccounts, onClose, onSave, onDelete }: {
  acc: FlexAccount | null; cashAccounts: Holding[]; onClose: () => void;
  onSave: (id: string | undefined, x: FlexInput, link: CashLink) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  const t = today();
  const [institution, setInstitution] = useState(acc?.institution ?? "");
  const [name, setName] = useState(acc?.name ?? "");
  const [compounding, setCompounding] = useState<Compounding>(acc?.compounding ?? "daily");
  const [taxPct, setTaxPct] = useState(String(acc?.taxPct ?? 0));
  const curRate = acc ? rateOn(acc, t) : 0;
  const [rate, setRate] = useState(acc ? String(curRate) : "");
  const [rateFrom, setRateFrom] = useState(fd(t));
  const [note, setNote] = useState(acc?.note ?? "");
  // Chỉ khi tạo mới: số tiền nạp ban đầu
  const [amount, setAmount] = useState<number | null>(null);
  const [openDate, setOpenDate] = useState(fd(t));
  const [src, setSrc] = useState("new");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const r = Number(rate);
  const rateChanged = !!acc && r !== curRate;
  const valid = institution.trim() && r >= 0 && rate !== "" && (acc || (amount && amount > 0 && openDate));

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    let rates = acc ? [...acc.rates] : [{ from: openDate, rate: r }];
    if (rateChanged) rates = [...rates.filter((x) => x.from !== rateFrom), { from: rateFrom, rate: r }].sort((a, b) => (a.from < b.from ? -1 : 1));
    const txns: FlexTxn[] = acc ? acc.txns : [{ id: uid(), date: openDate, kind: "deposit", amount: amount!, external: src === "new", note: "Nạp lần đầu" }];
    const ok = await onSave(acc?.id, {
      institution: institution.trim(), name: name.trim(), compounding, taxPct: Number(taxPct) || 0, rates, txns, note: note.trim(),
    }, !acc && src !== "new" ? { holdingId: src } : null);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <>
      <h3>{acc ? "Sửa tài khoản tích luỹ" : "Thêm tích luỹ không kỳ hạn"}</h3>
      <div className="fields">
        <label className="f">Nơi gửi<input id="f_inst" list="instList" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Cake, Timo, MB…" /></label>
        <label className="f">Tên <span className="hint">(tuỳ chọn)</span><input id="f_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tích luỹ linh hoạt" /></label>
        <label className="f">{acc ? "Lãi suất hiện tại (%/năm)" : "Lãi suất (%/năm)"}
          <input id="f_rate" type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="3.5" />
        </label>
        <label className="f">Cách trả lãi
          <select id="f_comp" value={compounding} onChange={(e) => setCompounding(e.target.value as Compounding)}>
            <option value="daily">Nhập gốc hằng ngày</option>
            <option value="monthly">Nhập gốc hằng tháng</option>
            <option value="none">Không nhập gốc (trả khi rút)</option>
          </select>
        </label>
        {rateChanged && (
          <label className="f">Áp dụng lãi suất mới từ ngày<input id="f_ratefrom" type="date" value={rateFrom} onChange={(e) => setRateFrom(e.target.value)} /></label>
        )}
        <label className="f">Thuế trên lãi (%) <span className="hint">ngân hàng: 0 · fintech: 5</span>
          <input id="f_tax" type="number" step="0.01" min="0" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
        </label>
        {!acc && (
          <>
            <label className="f">Số tiền nạp lần đầu (₫)<MoneyInput id="f_amount" value={amount} onChange={setAmount} placeholder="10.000.000" /></label>
            <label className="f">Ngày nạp<input id="f_open" type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} /></label>
            <label className="f full">Nguồn tiền
              <SourceSelect id="f_src" value={src} onChange={setSrc} cashAccounts={cashAccounts} />
            </label>
          </>
        )}
        <label className="f full">Ghi chú<input id="f_note" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      {acc && <p className="note" style={{ margin: 0 }}>Lịch sử lãi suất: {acc.rates.map((x) => `${fmt2(x.rate)}% từ ${dstr(x.from)}`).join(" → ")}. Đổi lãi suất sẽ thêm mốc mới, lãi các ngày trước vẫn tính theo mức cũ.</p>}
      <div className="dlg-actions">
        {acc && <button type="button" className="btn ghost danger left" onClick={() => setConfirmDel(true)}>Xoá</button>}
        <button type="button" className="btn" onClick={onClose}>Huỷ</button>
        <button type="button" className="btn primary" disabled={!valid || busy} onClick={submit}>{busy ? "Đang lưu…" : "Lưu"}</button>
      </div>
      <Confirm open={confirmDel} title="Xoá tài khoản tích luỹ?" text={`Xoá ${institution} cùng toàn bộ lịch sử nạp rút. Không hoàn tác được.`} okLabel="Xoá"
        onClose={() => setConfirmDel(false)} onOk={async () => { await onDelete(acc!.id); onClose(); }} />
    </>
  );
}

function SourceSelect({ id, value, onChange, cashAccounts }: { id: string; value: string; onChange: (v: string) => void; cashAccounts: Holding[] }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="new">Tiền mới bỏ thêm (tính vào vốn)</option>
      {cashAccounts.map((h) => <option key={h.id} value={h.id}>Lấy từ tiền chờ: {h.name}{h.place ? ` · ${h.place}` : ""} (đang có {money(h.qty)})</option>)}
    </select>
  );
}

/* ======================= Nạp / Rút / Điều chỉnh ======================= */
export function FlexTxnDialog({ target, cashAccounts, onClose, onConfirm }: {
  target: { acc: FlexAccount; kind: FlexTxnKind } | null; cashAccounts: Holding[]; onClose: () => void;
  onConfirm: (acc: FlexAccount, txn: FlexTxn, link: CashLink) => Promise<boolean>;
}) {
  return (
    <Modal open={!!target} onClose={onClose}>
      {target && <TxnForm key={target.acc.id + target.kind} acc={target.acc} kind={target.kind} cashAccounts={cashAccounts} onClose={onClose} onConfirm={onConfirm} />}
    </Modal>
  );
}

function TxnForm({ acc, kind, cashAccounts, onClose, onConfirm }: {
  acc: FlexAccount; kind: FlexTxnKind; cashAccounts: Holding[]; onClose: () => void;
  onConfirm: (acc: FlexAccount, txn: FlexTxn, link: CashLink) => Promise<boolean>;
}) {
  const [date, setDate] = useState(fd(today()));
  const [amount, setAmount] = useState<number | null>(null);
  const [actual, setActual] = useState<number | null>(null);
  const [where, setWhere] = useState(kind === "deposit" ? "new" : "out");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Giá trị tài khoản ngay trước ngày giao dịch (đã tính lãi tới hết hôm trước)
  const before = flexSim(acc, pd(date || fd(today()))).value;
  const all = kind === "withdraw" && amount !== null && Math.abs(amount - Math.round(before)) <= 1;
  const adjAmount = actual !== null ? Math.round(actual - before) : 0;
  const valid = !!date && (kind === "adjust" ? actual !== null && adjAmount !== 0 : !!amount && amount > 0 && (kind !== "withdraw" || amount <= Math.round(before) + 1));

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    const txn: FlexTxn = {
      id: uid(), date, kind,
      amount: kind === "adjust" ? adjAmount : Math.min(amount!, kind === "withdraw" ? Math.round(before) : amount!),
      external: kind === "adjust" ? false : kind === "deposit" ? where === "new" : where === "out",
      note: note.trim(),
    };
    const link: CashLink = kind === "adjust" || where === "new" || where === "out" ? null
      : where === "newcash" ? { newName: `Tài khoản ${acc.institution}`, place: acc.institution } : { holdingId: where };
    const ok = await onConfirm(acc, txn, link);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <>
      <h3>{kind === "deposit" ? "Nạp thêm" : kind === "withdraw" ? "Rút tiền" : "Điều chỉnh cho khớp app"} · {acc.institution}</h3>
      <div className="note num">Số dư tới {dstr(date)}: {money(before)}</div>
      <div className="fields">
        <label className="f">Ngày<input id="x_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        {kind === "adjust" ? (
          <label className="f">Số dư thực tế trên app (₫)<MoneyInput id="x_actual" value={actual} onChange={setActual} /></label>
        ) : (
          <label className="f">Số tiền (₫)
            <MoneyInput id="x_amount" value={amount} onChange={setAmount} />
            {kind === "withdraw" && <button type="button" className="btn small ghost" style={{ justifySelf: "start" }} onClick={() => setAmount(Math.round(before))}>Rút hết</button>}
          </label>
        )}
        {kind === "deposit" && (
          <label className="f full">Nguồn tiền<SourceSelect id="x_src" value={where} onChange={setWhere} cashAccounts={cashAccounts} /></label>
        )}
        {kind === "withdraw" && (
          <label className="f full">Tiền rút ra đi đâu?
            <select id="x_dest" value={where} onChange={(e) => setWhere(e.target.value)}>
              <option value="out">Đem đi tiêu / ra ngoài (tính vào "Đã rút ra")</option>
              {cashAccounts.map((h) => <option key={h.id} value={h.id}>Chuyển vào tiền chờ: {h.name}{h.place ? ` · ${h.place}` : ""}</option>)}
              <option value="newcash">Chuyển vào tiền chờ mới: Tài khoản {acc.institution}</option>
            </select>
          </label>
        )}
        <label className="f full">Ghi chú<input id="x_note" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <div className="calc">
        {kind === "adjust" ? (
          <div className="row total"><span>Chênh lệch (tính vào lời)</span><span className={`num ${adjAmount >= 0 ? "pos" : "neg"}`}>{adjAmount >= 0 ? "+" : "−"}{money(Math.abs(adjAmount))}</span></div>
        ) : (
          <div className="row total"><span>Số dư sau giao dịch</span><span className="num">{money(before + (kind === "deposit" ? 1 : -1) * (amount || 0))}</span></div>
        )}
        {kind === "withdraw" && amount !== null && amount > Math.round(before) + 1 && <div className="row neg"><span>Vượt số dư</span><span className="num">{moneyS(amount - before)}</span></div>}
        {all && <div className="note">Rút hết: tài khoản còn 0, lịch sử vẫn được giữ.</div>}
      </div>
      <div className="dlg-actions">
        <button type="button" className="btn" onClick={onClose}>Huỷ</button>
        <button type="button" className="btn primary" disabled={!valid || busy} onClick={submit}>{busy ? "Đang lưu…" : "Xác nhận"}</button>
      </div>
    </>
  );
}
