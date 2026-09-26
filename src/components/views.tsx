"use client";
import { useEffect, useRef, useState } from "react";
import type { Deposit, Holding } from "@/lib/types.ts";
import {
  TYPES, TYPE_ORDER, accrued, currentSegment, days, dstr, earlyInterest, expGross, fmt2, money, moneyS, netClosed, parseMoney, pd, signed,
  termDays, totals, yearStats, fmt, fd, pendingPayouts,
} from "@/lib/calc.ts";

type Totals = ReturnType<typeof totals>;
type YStats = ReturnType<typeof yearStats>;

function Pill({ left }: { left: number }) {
  if (left < 0) return <span className="pill bad">Quá hạn {-left} ngày</span>;
  if (left === 0) return <span className="pill warn">Đáo hạn hôm nay</span>;
  if (left <= 7) return <span className="pill warn">Còn {left} ngày</span>;
  return <span className="pill mute">Còn {left} ngày</span>;
}

export function RangeSelect({ id, value, years, onChange }: { id: string; value: string; years: number[]; onChange: (v: string) => void }) {
  return (
    <select id={id} aria-label="Khoảng thời gian" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">Toàn bộ</option>
      <option value="12m">12 tháng gần nhất</option>
      {years.map((y) => <option key={y} value={String(y)}>Năm {y}</option>)}
    </select>
  );
}

/* ======================= Overview ======================= */
export function Overview({ deps, hold, t, range, years, setRange, onCloseDep, onPayout }: {
  deps: Deposit[]; hold: Holding[]; t: number; range: string; years: number[]; setRange: (r: string) => void;
  onCloseDep: (d: Deposit) => void; onPayout: (d: Deposit) => void;
}) {
  const pending = pendingPayouts(deps);
  const T = totals(deps, hold, t);
  const Y = yearStats(deps, range, t);
  const yNow = new Date(t).getUTCFullYear();
  const Ynow = yearStats(deps, String(yNow), t);
  const pl = T.invVal - T.invCost;
  const up = T.act.map((d) => ({ d, left: days(t, pd(d.maturityDate)) })).filter((x) => x.left <= 45).sort((a, b) => a.left - b.left);
  const map = new Map<string, number>();
  for (const d of T.act) map.set(d.institution, (map.get(d.institution) || 0) + d.principal + accrued(d, t));
  for (const h of hold) { const k = h.place || TYPES[h.type].label; map.set(k, (map.get(k) || 0) + h.qty * h.price); }
  const rows = [...map].sort((a, b) => b[1] - a[1]);
  const mx = Math.max(1, ...rows.map((r) => r[1]));

  return (
    <section className="view">
      <div className="hero">
        <div className="panel networth">
          <div className="eyebrow">Tổng tài sản</div>
          <div className="big num">{fmt(T.nw)}<small>₫</small></div>
          <p>Tiết kiệm {moneyS(T.principal + T.acc)} · Đầu tư {moneyS(T.invVal)} · Tiền mặt {moneyS(T.cash)}</p>
        </div>
        <div className="kpis">
          <Kpi k="Gốc đang gửi" v={money(T.principal)} d={`${T.act.length} sổ · LS bình quân ${fmt2(T.wRate)}%/năm`} />
          <Kpi k="Lãi dồn tích đến hôm nay" v={money(T.acc)} d={`Dự kiến khi đáo hạn: ${moneyS(T.expected)}`} />
          <Kpi k={`Lãi thực nhận ${yNow}`} v={money(Ynow.net)} d={`Thuế ${moneyS(Ynow.tax)} · Phí ${moneyS(Ynow.fee)}`} />
          <Kpi k="Đầu tư (giá trị hiện tại)" v={money(T.invVal)}
            d={<span className={pl >= 0 ? "pos" : "neg"}>{signed(pl)}{T.invCost ? ` (${pl >= 0 ? "+" : ""}${fmt2((pl / T.invCost) * 100)}%)` : ""}</span>} />
        </div>
      </div>
      {pending.length > 0 && (
        <div className="panel attn">
          <h2>{pending.length} sổ đã tất toán chưa ghi tiền nhận về
            <span className="sub">· {money(pending.reduce((s, d) => s + d.principal + netClosed(d), 0))} chưa có trong tổng tài sản</span></h2>
          <div className="list">
            {pending.map((d) => (
              <div className="li" key={d.id}>
                <span className="pill warn">Chưa ghi</span>
                <div>
                  <div className="t">{d.institution}{d.label ? ` · ${d.label}` : ""}</div>
                  <div className="s num">Tất toán {dstr(d.closeDate)} · nhận về {money(d.principal + netClosed(d))}</div>
                </div>
                <button className="btn small" onClick={() => onPayout(d)}>Ghi tiền về</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid3">
        <div className="panel">
          <h2>Phân bổ tài sản</h2>
          <Donut T={T} />
        </div>
        <div className="panel">
          <h2>Lãi tiết kiệm thực nhận {range === "all" ? "theo năm" : "theo tháng"} <span className="sub">· {Y.label}: {money(Y.net)}</span>
            <span className="right"><RangeSelect id="range1" value={range} years={years} onChange={setRange} /></span></h2>
          <MonthlyBars Y={Y} />
        </div>
      </div>
      <div className="grid2">
        <div className="panel">
          <h2>Sắp đáo hạn <span className="sub">trong 45 ngày</span></h2>
          <div className="list">
            {up.length ? up.map(({ d, left }) => (
              <div className="li" key={d.id}>
                <Pill left={left} />
                <div>
                  <div className="t">{d.institution}{d.label ? ` · ${d.label}` : ""}</div>
                  <div className="s num">{dstr(d.maturityDate)} · gốc {moneyS(d.principal)} · lãi dự kiến {moneyS(expGross(d))}</div>
                </div>
                <button className="btn small" onClick={() => onCloseDep(d)}>Tất toán</button>
              </div>
            )) : <div className="empty">Không có sổ nào đáo hạn trong 45 ngày tới.</div>}
          </div>
        </div>
        <div className="panel">
          <h2>Theo nơi gửi / nền tảng</h2>
          <div className="bars">
            {rows.length ? rows.map(([k, v]) => (
              <div className="bar-row" key={k} data-tip={`${k}: ${money(v)}`}>
                <span className="lbl" title={k}>{k}</span>
                <div className="track"><div className="fill" style={{ width: `${(v / mx) * 100}%` }} /></div>
                <span className="val num">{moneyS(v)}</span>
              </div>
            )) : <div className="empty">Chưa có dữ liệu.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

function Kpi({ k, v, d }: { k: string; v: string; d: React.ReactNode }) {
  return <div className="kpi"><div className="eyebrow">{k}</div><div className="v num">{v}</div><div className="d num">{d}</div></div>;
}

function Donut({ T }: { T: Totals }) {
  const entries = TYPE_ORDER.map((k) => [k, T.byType[k]] as const).filter((e) => e[1] > 0);
  const tot = entries.reduce((s, e) => s + e[1], 0);
  const R = 80, r = 54, cx = 90, cy = 90;
  let a0 = -Math.PI / 2;
  const p = (ang: number, rad: number) => `${cx + rad * Math.cos(ang)} ${cy + rad * Math.sin(ang)}`;
  const paths = entries.map(([k, v]) => {
    const a1 = a0 + (v / tot) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = entries.length === 1
      ? `M${cx} ${cy - R}A${R} ${R} 0 1 1 ${cx - 0.01} ${cy - R}L${cx - 0.01} ${cy - r}A${r} ${r} 0 1 0 ${cx} ${cy - r}Z`
      : `M${p(a0, R)}A${R} ${R} 0 ${large} 1 ${p(a1, R)}L${p(a1, r)}A${r} ${r} 0 ${large} 0 ${p(a0, r)}Z`;
    a0 = a1;
    return <path key={k} d={d} fill={TYPES[k].color} stroke="var(--surface)" strokeWidth={2} data-tip={`${TYPES[k].label}: ${money(v)} (${fmt2((v / tot) * 100)}%)`} />;
  });
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 180 180" role="img" aria-label="Biểu đồ phân bổ tài sản">
        {tot ? paths : <circle cx={cx} cy={cy} r={(R + r) / 2} fill="none" stroke="var(--line)" strokeWidth={R - r} />}
        <text x="90" y="86" textAnchor="middle" fontSize="11" fill="var(--ink-3)">{entries.length} loại</text>
        <text x="90" y="104" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--ink)">{moneyS(tot)}</text>
      </svg>
      <div className="legend">
        {entries.length ? entries.map(([k, v]) => (
          <div className="row" key={k}>
            <span className="sw" style={{ background: TYPES[k].color }} />
            <span>{TYPES[k].label}</span>
            <span className="num">{moneyS(v)}</span>
            <span className="pct num">{fmt2(Math.round((v / tot) * 1000) / 10)}%</span>
          </div>
        )) : <div className="empty">Chưa có tài sản.</div>}
      </div>
    </div>
  );
}

function MonthlyBars({ Y }: { Y: YStats }) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(el.clientWidth, 320)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 220, pl = 46, pr = 8, pt = 12, pb = 26;
  const mx = Math.max(...Y.buckets.map((b) => b.value), 0);
  const nice = (v: number) => { if (v <= 0) return 1e6; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
  const top = nice(mx * 1.05);
  const n = Math.max(1, Y.buckets.length);
  const cw = (W - pl - pr) / n, bw = Math.min(28, cw * 0.6);
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / top);
  return (
    <div className="chart-box" ref={ref}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Lãi thực nhận theo tháng">
        {[0, top / 2, top].map((tk) => (
          <g key={tk}>
            <line x1={pl} x2={W - pr} y1={y(tk)} y2={y(tk)} stroke="var(--line-soft)" />
            <text x={pl - 6} y={y(tk) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">{moneyS(tk)}</text>
          </g>
        ))}
        {Y.buckets.map((bk, i) => {
          const v = bk.value;
          const cx = pl + cw * i + cw / 2;
          const h = y(0) - y(v), rr = Math.min(4, h);
          return (
            <g key={bk.key}>
              {v > 0 && <path fill="var(--s1)" d={`M${cx - bw / 2} ${y(0)}V${y(v) + rr}Q${cx - bw / 2} ${y(v)} ${cx - bw / 2 + rr} ${y(v)}H${cx + bw / 2 - rr}Q${cx + bw / 2} ${y(v)} ${cx + bw / 2} ${y(v) + rr}V${y(0)}Z`} />}
              <rect x={cx - cw / 2} y={pt} width={cw} height={H - pt - pb} fill="transparent" data-tip={`${bk.tip}: ${money(v)}`} />
              {(cw >= 26 || i % 2 === 0) && <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink-3)">{bk.label}</text>}
            </g>
          );
        })}
        <line x1={pl} x2={W - pr} y1={y(0)} y2={y(0)} stroke="var(--line)" />
      </svg>
    </div>
  );
}

/* ======================= Savings ======================= */
export function Savings({ deps, t, range, years, setRange, onEdit, onCloseDep, onPayout }: {
  deps: Deposit[]; t: number; range: string; years: number[]; setRange: (r: string) => void;
  onEdit: (d: Deposit) => void; onCloseDep: (d: Deposit) => void; onPayout: (d: Deposit) => void;
}) {
  const pendingIds = new Set(pendingPayouts(deps).map((d) => d.id));
  const [status, setStatus] = useState<"active" | "closed">("active");
  const [inst, setInst] = useState("");
  const Y = yearStats(deps, range, t);
  const insts = [...new Set(deps.map((d) => d.institution))].sort();
  const list = deps.filter((d) => (status === "active") === (d.status !== "closed") && (!inst || d.institution === inst));

  return (
    <section className="view">
      <div className="toolbar">
        <span className="eyebrow">Kết quả</span>
        <RangeSelect id="range2" value={range} years={years} onChange={setRange} />
        <span className="note">Tất toán trong {Y.label}: {Y.closed.length} sổ</span>
      </div>
      <div className="yearstrip">
        <Strip k="Lãi thực nhận (ròng)" v={money(Y.net)} d={`${Y.closed.length} sổ đã tất toán`} c={Y.net > 0 ? "pos" : ""} />
        <Strip k="Thuế đã trừ" v={money(Y.tax)} d="trên lãi nhận" />
        <Strip k="Phí" v={money(Y.fee)} d="rút, chuyển tiền…" />
        <Strip k="Lãi sinh ra trong kỳ" v={money(Y.accrual)} d={range === "all" ? "tổng lãi đã sinh ra, kể cả sổ chưa đáo hạn" : "phần lãi thuộc kỳ này theo số ngày gửi, kể cả sổ chưa đáo hạn"} />
        <Strip k="Lãi mất do rút trước hạn" v={money(Y.lost)} d={`${Y.early} lần rút sớm`} c={Y.lost > 0 ? "neg" : ""} />
      </div>
      <div className="toolbar">
        <div className="seg">
          <button aria-pressed={status === "active"} onClick={() => setStatus("active")}>Đang gửi</button>
          <button aria-pressed={status === "closed"} onClick={() => setStatus("closed")}>Đã tất toán</button>
        </div>
        <select aria-label="Lọc theo nơi gửi" value={inst} onChange={(e) => setInst(e.target.value)}>
          <option value="">Tất cả nơi gửi</option>
          {insts.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <span className="note">{list.length} sổ{status === "active" ? ` · gốc ${money(list.reduce((s, d) => s + d.principal, 0))}` : ""}</span>
      </div>
      {status === "active" ? <ActiveBooks list={list} t={t} onEdit={onEdit} onCloseDep={onCloseDep} /> : <ClosedTable list={list} onEdit={onEdit} pendingIds={pendingIds} onPayout={onPayout} />}
    </section>
  );
}

function Strip({ k, v, d, c = "" }: { k: string; v: string; d: string; c?: string }) {
  return <div><div className="eyebrow">{k}</div><div className={`v num ${c}`}>{v}</div><div className="d">{d}</div></div>;
}

function ActiveBooks({ list, t, onEdit, onCloseDep }: { list: Deposit[]; t: number; onEdit: (d: Deposit) => void; onCloseDep: (d: Deposit) => void }) {
  const sorted = [...list].sort((a, b) => pd(a.maturityDate) - pd(b.maturityDate));
  if (!sorted.length) return <div className="empty">Không có sổ nào đang gửi. Bấm “+ Sổ tiết kiệm” để thêm.</div>;
  return (
    <div className="books">
      {sorted.map((d) => {
        const left = days(t, pd(d.maturityDate));
        const pct = Math.min(100, Math.max(0, (days(pd(d.openDate), t) / termDays(d)) * 100));
        const g = expGross(d), tax = (g * (d.taxPct || 0)) / 100;
        const cur = d.tiers ? currentSegment(d, t) : null;
        return (
          <article className="book" key={d.id}>
            <div className="head">
              <div><div className="inst">{d.institution}</div><div className="lab">{d.label || `Sổ ${d.termMonths} tháng`}</div></div>
              <Pill left={left} />
            </div>
            <div className="amt num">{money(d.principal)}</div>
            <dl className="num">
              <div><dt>{d.tiers ? "Bậc thang · bình quân" : "Lãi suất · kỳ hạn"}</dt><dd>{fmt2(d.rate)}% · {d.termMonths ? `${d.termMonths} tháng` : `${termDays(d)} ngày`}</dd></div>
              <div><dt>Lãi dồn tích</dt><dd>{money(accrued(d, t))}</dd></div>
              <div><dt>Lãi dự kiến khi đáo hạn</dt><dd>{money(g - tax)}</dd></div>
              <div><dt>Nếu rút hôm nay</dt><dd>{money(earlyInterest(d, t) * (1 - (d.taxPct || 0) / 100))}</dd></div>
            </dl>
            {cur && (
              <div className="tier-now">
                <span className="pill tier">Bậc {cur.index + 1}/{cur.count} · {fmt2(cur.seg.rate)}%</span>
                {cur.index + 1 < cur.count
                  ? <span className="note num">Lên bậc {fmt2(d.tiers![cur.index + 1].rate)}% vào {dstr(fd(cur.seg.end))} (còn {days(t, cur.seg.end)} ngày)</span>
                  : <span className="note">Bậc cuối</span>}
              </div>
            )}
            <div>
              <div className="progress"><i style={{ width: `${pct}%` }} /></div>
              <div className="terms num"><span>{dstr(d.openDate)}</span><span>{dstr(d.maturityDate)}</span></div>
            </div>
            {d.note && <div className="note">{d.note}</div>}
            <div className="foot">
              <button className="btn small ghost" onClick={() => onEdit(d)}>Sửa</button>
              <button className="btn small" onClick={() => onCloseDep(d)}>Tất toán</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ClosedTable({ list, onEdit, pendingIds, onPayout }: {
  list: Deposit[]; onEdit: (d: Deposit) => void; pendingIds: Set<string>; onPayout: (d: Deposit) => void;
}) {
  const sorted = [...list].sort((a, b) => pd(b.closeDate) - pd(a.closeDate));
  const sum = (f: (d: Deposit) => number) => sorted.reduce((s, d) => s + f(d), 0);
  return (
    <div className="tbl-wrap">
      <table>
        <thead><tr><th>Nơi gửi</th><th>Gửi → rút</th><th className="r">Gốc</th><th className="r">LS</th><th className="r">Lãi nhận</th><th className="r">Thuế</th><th className="r">Phí</th><th className="r">Lãi ròng</th><th className="r">Lợi suất thực</th><th /></tr></thead>
        <tbody>
          {sorted.length ? sorted.map((d) => {
            const dd = Math.max(1, days(pd(d.openDate), pd(d.closeDate)));
            const eff = ((netClosed(d) / d.principal) * 365) / dd * 100;
            return (
              <tr key={d.id}>
                <td>{d.institution}<div className="s">{d.label}</div></td>
                <td className="num">{dstr(d.openDate)} → {dstr(d.closeDate)}<div className="s">{dd} ngày · {d.closeType === "early" ? <span className="pill bad">Rút trước hạn</span> : "đúng hạn"}</div></td>
                <td className="r num">{money(d.principal)}</td>
                <td className="r num">{fmt2(d.rate)}%{d.tiers ? <div className="s">bậc thang</div> : null}</td>
                <td className="r num">{money(d.interest)}</td>
                <td className="r num">{money(d.tax)}</td>
                <td className="r num">{money(d.fee)}</td>
                <td className="r num"><b>{money(netClosed(d))}</b></td>
                <td className="r num">{fmt2(eff)}%/năm</td>
                <td className="r">
                  {pendingIds.has(d.id) && <button className="btn small" onClick={() => onPayout(d)}>Ghi tiền về</button>}
                  <button className="btn small ghost" onClick={() => onEdit(d)}>Sửa</button>
                </td>
              </tr>
            );
          }) : <tr><td colSpan={10} className="empty">Chưa có sổ nào tất toán.</td></tr>}
        </tbody>
        {sorted.length > 0 && (
          <tfoot><tr><td colSpan={4}>Tổng</td><td className="r num">{money(sum((d) => d.interest || 0))}</td><td className="r num">{money(sum((d) => d.tax || 0))}</td>
            <td className="r num">{money(sum((d) => d.fee || 0))}</td><td className="r num">{money(sum(netClosed))}</td><td colSpan={2} /></tr></tfoot>
        )}
      </table>
    </div>
  );
}

/* ======================= Invest ======================= */
export function Invest({ hold, deps, t, onEdit, onQuickPrice, onRefresh, refreshing }: {
  hold: Holding[]; deps: Deposit[]; t: number; onEdit: (h: Holding) => void;
  onQuickPrice: (h: Holding, price: number) => Promise<void>; onRefresh: () => void; refreshing: boolean;
}) {
  const T = totals(deps, hold, t);
  const pl = T.invVal - T.invCost;
  const rows = [...hold].sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || b.qty * b.price - a.qty * a.price);
  const hasAuto = hold.some((h) => h.priceSource);
  return (
    <section className="view">
      <div className="yearstrip" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <Strip k="Giá trị hiện tại" v={money(T.invVal)} d="không gồm tiền mặt" />
        <Strip k="Tổng vốn" v={money(T.invCost)} d="" />
        <Strip k="Lãi / lỗ chưa chốt" v={signed(pl)} d={T.invCost ? `${pl >= 0 ? "+" : ""}${fmt2((pl / T.invCost) * 100)}%` : ""} c={pl >= 0 ? "pos" : "neg"} />
        <Strip k="Tiền mặt / không kỳ hạn" v={money(T.cash)} d="" />
      </div>
      <div className="toolbar">
        <button className="btn" onClick={onRefresh} disabled={!hasAuto || refreshing}>{refreshing ? "Đang lấy giá…" : "Cập nhật giá coin tự động"}</button>
        <span className="note">{hasAuto ? "Coin có CoinGecko id tự cập nhật mỗi sáng." : "Gắn CoinGecko id cho coin để tự lấy giá."} Giá vàng, ETF: bấm vào ô giá để sửa.</span>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Tài sản</th><th>Loại</th><th className="r">Số lượng</th><th className="r">Giá vốn TB</th><th className="r">Giá hiện tại</th><th className="r">Giá trị</th><th className="r">Lãi / lỗ</th><th /></tr></thead>
          <tbody>
            {rows.length ? rows.map((h) => {
              const v = h.qty * h.price, p = v - h.cost, cash = h.type === "cash";
              return (
                <tr key={h.id}>
                  <td><b>{h.name}</b><div className="s">{h.place}</div></td>
                  <td><span className="pill mute"><span style={{ width: 8, height: 8, borderRadius: 2, background: TYPES[h.type].color, display: "inline-block" }} />{TYPES[h.type].label}</span></td>
                  <td className="r num">{cash ? "–" : `${fmt2(h.qty)} ${h.unit}`}</td>
                  <td className="r num">{cash || !h.qty ? "–" : money(h.cost / h.qty)}</td>
                  <td className="r num">{cash ? "–" : <PriceCell h={h} onSave={onQuickPrice} />}</td>
                  <td className="r num"><b>{money(v)}</b></td>
                  <td className={`r num ${cash ? "" : p >= 0 ? "pos" : "neg"}`}>{cash ? "–" : <>{signed(p)}<div className="s">{h.cost ? `${p >= 0 ? "+" : ""}${fmt2((p / h.cost) * 100)}%` : ""}</div></>}</td>
                  <td className="r"><button className="btn small ghost" onClick={() => onEdit(h)}>Sửa</button></td>
                </tr>
              );
            }) : <tr><td colSpan={8} className="empty">Chưa có tài sản đầu tư. Bấm “+ Tài sản” để thêm.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PriceCell({ h, onSave }: { h: Holding; onSave: (h: Holding, price: number) => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState("");
  const commit = async (ok: boolean) => {
    setEdit(false);
    const p = parseMoney(val);
    if (ok && p > 0 && p !== h.price) await onSave(h, p);
  };
  if (edit) {
    return (
      <input autoFocus className="num" inputMode="numeric" aria-label={`Giá mới cho ${h.name}`} value={val}
        style={{ width: 130, textAlign: "right", border: "1px solid var(--accent)", borderRadius: 6, padding: "4px 6px", background: "var(--bg)" }}
        onChange={(e) => setVal(e.target.value.trim() ? fmt(parseMoney(e.target.value)) : "")}
        onKeyDown={(e) => { if (e.key === "Enter") commit(true); if (e.key === "Escape") commit(false); }}
        onBlur={() => commit(true)} />
    );
  }
  return (
    <>
      <button className="btn small ghost num" title="Cập nhật giá" onClick={() => { setVal(fmt(h.price)); setEdit(true); }}>{money(h.price)}</button>
      <div className="s">{h.priceDate ? dstr(h.priceDate) : ""}{h.priceSource ? " · tự động" : ""}</div>
    </>
  );
}
