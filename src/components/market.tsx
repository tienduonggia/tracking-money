"use client";
import { useState } from "react";
import type { Holding, MarketPrice, MarketPriceInput } from "@/lib/types.ts";
import { dstr, fd, fmt, money, parseMoney, today } from "@/lib/calc.ts";
import { GOLD_CODES } from "@/lib/gold.ts";
import { Confirm, Modal, MoneyInput } from "./ui.tsx";

const srcLabel = (src: string) => {
  if (src.startsWith("vangtoday:")) {
    const [, code] = src.split(":");
    return `tự động · ${GOLD_CODES.find((g) => g.code === code)?.label ?? code}`;
  }
  if (src.startsWith("coingecko:")) return `tự động · CoinGecko ${src.slice(10)}`;
  return "nhập tay";
};

/* ======================= Bảng giá thị trường ======================= */
export function MarketPanel({ markets, hold, onSave, onEdit, onAdd, onRefresh, refreshing }: {
  markets: MarketPrice[]; hold: Holding[];
  onSave: (m: MarketPrice, price: number) => Promise<void>;
  onEdit: (m: MarketPrice) => void; onAdd: () => void; onRefresh: () => void; refreshing: boolean;
}) {
  const hasAuto = markets.some((m) => m.source);
  return (
    <div className="panel">
      <h2>Giá thị trường <span className="sub">· một giá cho mỗi loại, áp cho mọi tài sản cùng loại</span>
        <span className="right" style={{ display: "flex", gap: 8 }}>
          <button className="btn small" onClick={onRefresh} disabled={!hasAuto || refreshing}>{refreshing ? "Đang lấy giá…" : "Cập nhật tự động"}</button>
          <button className="btn small" onClick={onAdd}>+ Loại giá</button>
        </span>
      </h2>
      {markets.length ? (
        <div className="list">
          {markets.map((m) => {
            const n = hold.filter((h) => h.priceKey === m.key).length;
            return (
              <div className="li mkt" key={m.id}>
                <div>
                  <div className="t">{m.label}</div>
                  <div className="s">{srcLabel(m.source)} · {n} tài sản · cập nhật {dstr(m.priceDate)}</div>
                </div>
                <div className="num r"><MarketPriceCell m={m} onSave={onSave} /></div>
                <button className="btn small ghost" onClick={() => onEdit(m)}>Sửa</button>
              </div>
            );
          })}
        </div>
      ) : <div className="empty">Chưa có loại giá. Thêm tài sản mới sẽ tự tạo loại giá, hoặc bấm “+ Loại giá”.</div>}
    </div>
  );
}

function MarketPriceCell({ m, onSave }: { m: MarketPrice; onSave: (m: MarketPrice, price: number) => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState("");
  const commit = async (ok: boolean) => {
    setEdit(false);
    const p = parseMoney(val);
    if (ok && p > 0 && p !== m.price) await onSave(m, p);
  };
  if (edit) {
    return (
      <input autoFocus className="num" inputMode="numeric" aria-label={`Giá mới cho ${m.label}`} value={val}
        style={{ width: 140, textAlign: "right", border: "1px solid var(--accent)", borderRadius: 6, padding: "4px 6px", background: "var(--bg)" }}
        onChange={(e) => setVal(e.target.value.trim() ? fmt(parseMoney(e.target.value)) : "")}
        onKeyDown={(e) => { if (e.key === "Enter") commit(true); if (e.key === "Escape") commit(false); }}
        onBlur={() => commit(true)} />
    );
  }
  return (
    <button className="btn small ghost num mkt-price" title="Bấm để sửa giá" onClick={() => { setVal(fmt(m.price)); setEdit(true); }}>
      <b>{money(m.price)}</b>{m.unit ? <span className="s"> /{m.unit}</span> : null}
    </button>
  );
}

/* ======================= Tạo / sửa loại giá ======================= */
export function MarketDialog({ target, onClose, onSave, onDelete }: {
  target: MarketPrice | "new" | null; onClose: () => void;
  onSave: (id: string | undefined, x: MarketPriceInput) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <Modal open={!!target} onClose={onClose}>
      {target && <MarketForm key={target === "new" ? "new" : target.id} m={target === "new" ? null : target} onClose={onClose} onSave={onSave} onDelete={onDelete} />}
    </Modal>
  );
}

function MarketForm({ m, onClose, onSave, onDelete }: {
  m: MarketPrice | null; onClose: () => void;
  onSave: (id: string | undefined, x: MarketPriceInput) => Promise<boolean>; onDelete: (id: string) => Promise<void>;
}) {
  const src0 = m?.source ?? "";
  const [label, setLabel] = useState(m?.label ?? "");
  const [unit, setUnit] = useState(m?.unit ?? "chỉ");
  const [kind, setKind] = useState<"manual" | "gold" | "coin">(src0.startsWith("vangtoday:") ? "gold" : src0.startsWith("coingecko:") ? "coin" : "manual");
  const [gold, setGold] = useState(src0.startsWith("vangtoday:") ? src0.split(":")[1] : "DOJINHTV");
  const [coin, setCoin] = useState(src0.startsWith("coingecko:") ? src0.slice(10) : "");
  const [price, setPrice] = useState<number | null>(m?.price ?? null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const source = kind === "gold" ? `vangtoday:${gold}:${unit.trim().toLowerCase() === "lượng" ? "luong" : "chi"}`
    : kind === "coin" && coin.trim() ? `coingecko:${coin.trim().toLowerCase()}` : "";
  const valid = label.trim() && (price ?? 0) >= 0;
  const submit = async () => {
    setBusy(true);
    const ok = await onSave(m?.id, { key: m?.key ?? "", label: label.trim(), unit: unit.trim(), source, price: price || 0, priceDate: price !== m?.price ? fd(today()) : m?.priceDate ?? fd(today()) });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <>
      <h3>{m ? "Sửa loại giá" : "Thêm loại giá"}</h3>
      <div className="fields">
        <label className="f">Tên loại<input id="m_label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nhẫn DOJI HTV, BTC, E1VFVN30…" /></label>
        <label className="f">Đơn vị<input id="m_unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="chỉ, lượng, CCQ, BTC…" /></label>
        <label className="f">Nguồn giá
          <select id="m_kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="manual">Nhập tay</option><option value="gold">Vàng – vang.today</option><option value="coin">Coin – CoinGecko</option>
          </select>
        </label>
        {kind === "gold" && (
          <label className="f">Loại vàng
            <select id="m_gold" value={gold} onChange={(e) => setGold(e.target.value)}>{GOLD_CODES.map((g) => <option key={g.code} value={g.code}>{g.label}</option>)}</select>
          </label>
        )}
        {kind === "coin" && <label className="f">CoinGecko id<input id="m_coin" value={coin} onChange={(e) => setCoin(e.target.value)} placeholder="bitcoin" /></label>}
        <label className="f">Giá hiện tại / {unit || "đơn vị"} (₫) <span className="hint">{kind === "manual" ? "" : "tự cập nhật mỗi sáng, sửa tay vẫn được"}</span>
          <MoneyInput id="m_price" value={price} onChange={setPrice} />
        </label>
      </div>
      {kind === "gold" && <p className="note" style={{ margin: 0 }}>Dùng giá tiệm mua vào (giá bán lại được), quy đổi từ lượng sang {unit || "chỉ"}.</p>}
      <div className="dlg-actions">
        {m && <button type="button" className="btn ghost danger left" onClick={() => setConfirmDel(true)}>Xoá</button>}
        <button type="button" className="btn" onClick={onClose}>Huỷ</button>
        <button type="button" className="btn primary" disabled={!valid || busy} onClick={submit}>{busy ? "Đang lưu…" : "Lưu"}</button>
      </div>
      <Confirm open={confirmDel} title="Xoá loại giá?" text={`Các tài sản đang theo "${label}" sẽ giữ giá cuối và chuyển sang giá riêng nhập tay.`} okLabel="Xoá"
        onClose={() => setConfirmDel(false)} onOk={async () => { await onDelete(m!.id); onClose(); }} />
    </>
  );
}
