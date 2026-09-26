"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Deposit, DepositInput, Holding, HoldingInput } from "@/lib/types.ts";
import { dstr, fd, money, today } from "@/lib/calc.ts";
import { api, ApiError, getToken, setToken, tg } from "@/lib/client.ts";
import { ToastProvider, TipLayer, useToast } from "./ui.tsx";
import { ApproveDialog, PairLogin } from "./pairing.tsx";
import { Overview, Savings, Invest } from "./views.tsx";
import { CloseDialog, DepositDialog, HoldingDialog, PayoutDialog, renewalDraft, type DepositDraft, type HoldingDraft, type Payout, type Rollover } from "./dialogs.tsx";

type Auth =
  | { state: "checking" }
  | { state: "out"; error?: string; telegramId?: number }
  | { state: "in"; name: string };

export default function App() {
  return (
    <ToastProvider>
      <Root />
      <TipLayer />
    </ToastProvider>
  );
}

function Root() {
  const [auth, setAuth] = useState<Auth>({ state: "checking" });

  const loginFail = (e: unknown) => {
    const err = e as ApiError;
    setAuth({ state: "out", error: err.message, telegramId: err.body?.telegramId as number | undefined });
  };

  useEffect(() => {
    const app = tg();
    if (app) {
      // Trong Telegram: đồng bộ theme, đăng nhập bằng initData (không lưu token lâu dài)
      app.ready();
      app.expand();
      const applyTheme = () => { document.documentElement.dataset.theme = app.colorScheme; };
      applyTheme();
      app.onEvent("themeChanged", applyTheme);
      api<{ token: string; user: { name: string } }>("/api/auth/webapp", { method: "POST", json: { initData: app.initData } })
        .then((r) => { setToken(r.token, false); setAuth({ state: "in", name: r.user.name }); })
        .catch(loginFail);
      return;
    }
    if (!getToken()) return setAuth({ state: "out" });
    api<{ name: string }>("/api/me")
      .then((s) => setAuth({ state: "in", name: s.name }))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) setToken(null);
        setAuth({ state: "out", error: e instanceof ApiError && e.status === 401 ? undefined : "Không kết nối được máy chủ, thử tải lại trang." });
      });
  }, []);

  if (auth.state === "checking") return <div className="skeleton">Đang tải…</div>;
  if (auth.state === "out") return <Login error={auth.error} telegramId={auth.telegramId} onLogin={(name) => setAuth({ state: "in", name })} onError={loginFail} />;
  return <Dashboard name={auth.name} onLogout={() => { setToken(null); setAuth({ state: "out" }); }} />;
}

/* ======================= Login (website) ======================= */
function Login({ error, telegramId, onLogin, onError }: {
  error?: string; telegramId?: number; onLogin: (name: string) => void; onError: (e: unknown) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  useEffect(() => {
    if (!bot || !box.current) return;
    (window as unknown as { onTelegramAuth: (u: Record<string, unknown>) => void }).onTelegramAuth = (u) => {
      api<{ token: string; user: { name: string } }>("/api/auth/widget", { method: "POST", json: u })
        .then((r) => { setToken(r.token); onLogin(r.user.name); })
        .catch(onError);
    };
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", bot);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "8");
    s.setAttribute("data-request-access", "write"); // cho phép bot nhắn nhắc đáo hạn
    s.setAttribute("data-onauth", "onTelegramAuth(user)");
    box.current.innerHTML = "";
    box.current.appendChild(s);
  }, [bot, onLogin, onError]);

  return (
    <div className="wrap login">
      <div className="card">
        <h1>Sổ Tài Sản</h1>
        <p>Đăng nhập bằng Telegram để xem sổ tiết kiệm và tài sản của bạn.</p>
        {error && (
          <div className="err">
            {error}
            {telegramId ? <div style={{ marginTop: 6 }}>Telegram id của bạn: <code>{telegramId}</code></div> : null}
          </div>
        )}
        <PairLogin onLogin={onLogin} />
        <div className="or"><span>hoặc</span></div>
        {bot ? <div className="widget" ref={box} /> : <div className="err">Thiếu biến NEXT_PUBLIC_TELEGRAM_BOT_USERNAME.</div>}
        <p className="note">Nút Telegram yêu cầu xác nhận qua tin nhắn; nếu không nhận được tin, dùng cách đăng nhập bằng mã ở trên.</p>
      </div>
    </div>
  );
}

/* ======================= Dashboard ======================= */
type Tab = "overview" | "savings" | "invest";

function Dashboard({ name, onLogout }: { name: string; onLogout: () => void }) {
  const toast = useToast();
  const [deps, setDeps] = useState<Deposit[] | null>(null);
  const [hold, setHold] = useState<Holding[] | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState(String(new Date().getFullYear()));
  const [depDraft, setDepDraft] = useState<DepositDraft | null>(null);
  const [closing, setClosing] = useState<Deposit | null>(null);
  const [holdDraft, setHoldDraft] = useState<HoldingDraft | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [approve, setApprove] = useState<string | null>(null);
  const [payoutFor, setPayoutFor] = useState<Deposit | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const t = today();

  const onErr = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { toast("Phiên đăng nhập hết hạn"); onLogout(); return; }
    toast(e instanceof Error ? e.message : "Có lỗi xảy ra");
  }, [toast, onLogout]);

  const load = useCallback(async () => {
    try {
      const [d, h] = await Promise.all([api<Deposit[]>("/api/deposits"), api<Holding[]>("/api/holdings")]);
      setDeps(d); setHold(h);
    } catch (e) { onErr(e); }
  }, [onErr]);

  useEffect(() => {
    // Mở từ link t.me/<bot>/<app>?startapp=login_XXXX → mở sẵn hộp xác nhận
    const sp = tg()?.initDataUnsafe?.start_param || "";
    if (sp.startsWith("login_")) setApprove(sp.slice(6));
    load();
    try { const s = localStorage.getItem("sts_tab") as Tab | null; if (s) setTab(s); } catch { /* ignore */ }
  }, [load]);
  const pickTab = (k: Tab) => { setTab(k); try { localStorage.setItem("sts_tab", k); } catch { /* ignore */ } };

  const years = useMemo(() => {
    const ys = new Set([new Date().getFullYear()]);
    for (const d of deps || []) for (const s of [d.openDate, d.closeDate]) if (s) ys.add(Number(s.slice(0, 4)));
    return [...ys].sort((a, b) => b - a);
  }, [deps]);
  const places = useMemo(() => {
    const base = ["MB Bank", "Timo", "Topi", "Techcombank", "VPBank", "Vietcombank", "TPBank", "Cake", "ACB", "VIB", "SSI", "VNDirect", "Binance", "OKX", "PNJ", "SJC", "DOJI"];
    return [...new Set([...(deps || []).map((d) => d.institution), ...(hold || []).map((h) => h.place), ...base].filter(Boolean))];
  }, [deps, hold]);

  /* ---- mutations ---- */
  const saveDep = async (id: string | undefined, x: DepositInput) => {
    try {
      const r = await api<Deposit>(id ? `/api/deposits/${id}` : "/api/deposits", { method: id ? "PUT" : "POST", json: x });
      setDeps((p) => (id ? (p || []).map((d) => (d.id === id ? r : d)) : [...(p || []), r]));
      toast(id ? "Đã lưu thay đổi" : "Đã thêm sổ");
      return true;
    } catch (e) { onErr(e); return false; }
  };
  const delDep = async (id: string) => {
    try { await api(`/api/deposits/${id}`, { method: "DELETE" }); setDeps((p) => (p || []).filter((d) => d.id !== id)); toast("Đã xoá sổ"); }
    catch (e) { onErr(e); }
  };
  /** Cộng tiền nhận về vào tài sản tiền mặt để tổng tài sản không bị hụt. */
  const addToCash = async (payout: Payout, date: string) => {
    if (payout.dest === "none") return true;
      try {
        let r: Holding;
        if (payout.dest === "existing") {
          const h = (hold || []).find((z) => z.id === payout.holdingId);
          if (!h) throw new Error("Không tìm thấy tài khoản tiền mặt");
          const { id, ...rest } = h;
          r = await api<Holding>(`/api/holdings/${id}`, { method: "PUT", json: { ...rest, qty: h.qty + payout.amount, cost: h.cost + payout.amount, priceDate: date } });
          setHold((p) => (p || []).map((z) => (z.id === id ? r : z)));
        } else {
          r = await api<Holding>("/api/holdings", { method: "POST", json: { type: "cash", name: payout.name, place: payout.place, qty: payout.amount, unit: "₫", cost: payout.amount, price: 1, priceDate: date, priceSource: "", note: "Tạo khi tất toán sổ" } });
          setHold((p) => [...(p || []), r]);
        }
        toast(`Đã cộng ${money(payout.amount)} vào ${r.name}`);
        return true;
      } catch (e) { onErr(e); return false; }
  };
  const confirmClose = async (d: Deposit, x: DepositInput, roll: Rollover, payout: Payout) => {
    const ok = await saveDep(d.id, x);
    if (ok) await addToCash(payout, x.closeDate || fd(today()));
    if (ok && roll !== "none") {
      setTimeout(() => { setDepDraft(renewalDraft(d, x, roll)); toast("Kiểm tra lãi suất mới rồi bấm Lưu"); }, 150);
    }
    return ok;
  };
  /** Ghi bù cho sổ đã tất toán trước đây: cộng tiền mặt trước, rồi đánh dấu sổ đã xử lý. */
  const recordPayout = async (d: Deposit, payout: Payout) => {
    if (!(await addToCash(payout, d.closeDate || fd(today())))) return false;
    const { id, ...rest } = d;
    return saveDep(id, { ...rest, payout: payout.dest === "none" ? "none" : "cash" });
  };
  const saveHold = async (id: string | undefined, x: HoldingInput) => {
    try {
      const r = await api<Holding>(id ? `/api/holdings/${id}` : "/api/holdings", { method: id ? "PUT" : "POST", json: x });
      setHold((p) => (id ? (p || []).map((h) => (h.id === id ? r : h)) : [...(p || []), r]));
      toast(id ? "Đã lưu thay đổi" : "Đã thêm tài sản");
      return true;
    } catch (e) { onErr(e); return false; }
  };
  const delHold = async (id: string) => {
    try { await api(`/api/holdings/${id}`, { method: "DELETE" }); setHold((p) => (p || []).filter((h) => h.id !== id)); toast("Đã xoá"); }
    catch (e) { onErr(e); }
  };
  const quickPrice = async (h: Holding, price: number) => {
    const { id, ...rest } = h;
    await saveHold(id, { ...rest, price, priceDate: fd(today()) });
  };
  const refreshPrices = async () => {
    setRefreshing(true);
    try {
      const r = await api<{ updated: number; missing: string[] }>("/api/prices/refresh", { method: "POST" });
      await load();
      toast(`Đã cập nhật ${r.updated} giá${r.missing.length ? `, không tìm thấy: ${r.missing.join(", ")}` : ""}`);
    } catch (e) { onErr(e); }
    setRefreshing(false);
  };
  const exportJson = async () => {
    try {
      const data = await api("/api/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `so-tai-san-${fd(today())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { onErr(e); }
  };
  const importJson = async (file: File) => {
    try {
      const body = JSON.parse(await file.text());
      const r = await api<{ deposits: number; holdings: number }>("/api/import", { method: "POST", json: body });
      await load();
      toast(`Đã nhập ${r.deposits} sổ, ${r.holdings} tài sản`);
    } catch (e) { onErr(e instanceof SyntaxError ? new Error("File không phải JSON hợp lệ") : e); }
  };

  const inTelegram = !!tg();

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand"><h1>Sổ Tài Sản</h1><span>{dstr(fd(t))}</span></div>
        <nav className="tabs" role="tablist">
          {([["overview", "Tổng quan"], ["savings", "Tiết kiệm"], ["invest", "Đầu tư"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => pickTab(k)}>{l}</button>
          ))}
        </nav>
        <div className="actions">
          <button className="btn primary" onClick={() => setDepDraft({})}>+ Sổ tiết kiệm</button>
          <button className="btn" onClick={() => setHoldDraft({})}>+ Tài sản</button>
        </div>
      </header>

      {deps === null || hold === null ? <div className="skeleton">Đang tải dữ liệu…</div> : (
        <>
          {tab === "overview" && <Overview deps={deps} hold={hold} t={t} range={range} years={years} setRange={setRange} onCloseDep={setClosing} onPayout={setPayoutFor} />}
          {tab === "savings" && <Savings deps={deps} t={t} range={range} years={years} setRange={setRange} onEdit={(d) => setDepDraft(d)} onCloseDep={setClosing} onPayout={setPayoutFor} />}
          {tab === "invest" && <Invest hold={hold} deps={deps} t={t} onEdit={(h) => setHoldDraft(h)} onQuickPrice={quickPrice} onRefresh={refreshPrices} refreshing={refreshing} />}
        </>
      )}

      <footer className="note" style={{ marginTop: 24, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {!inTelegram && <button className="btn small ghost" onClick={exportJson}>Xuất JSON</button>}
        <button className="btn small ghost" onClick={() => fileRef.current?.click()}>Nhập JSON</button>
        <button className="btn small ghost" onClick={() => setApprove("")}>Đăng nhập máy tính</button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="file-in"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ""; }} />
        <span style={{ marginLeft: "auto" }} className="userbox">
          {name}
          {!inTelegram && <button className="btn small ghost" onClick={onLogout}>Đăng xuất</button>}
        </span>
      </footer>
      <p className="note">Lãi tiền gửi ngân hàng của cá nhân được miễn thuế TNCN; ô “thuế” dành cho sản phẩm fintech/quỹ có khấu trừ.</p>

      <datalist id="instList">{places.map((p) => <option key={p} value={p} />)}</datalist>
      <DepositDialog draft={depDraft} institutions={places} onClose={() => setDepDraft(null)} onSave={saveDep} onDelete={delDep} />
      <PayoutDialog deposit={payoutFor} cashAccounts={(hold || []).filter((h) => h.type === "cash")} onClose={() => setPayoutFor(null)} onConfirm={recordPayout} />
      <CloseDialog deposit={closing} cashAccounts={(hold || []).filter((h) => h.type === "cash")} onClose={() => setClosing(null)} onConfirm={confirmClose} />
      <ApproveDialog open={approve !== null} initialCode={approve || ""} onClose={() => setApprove(null)} toast={toast} />
      <HoldingDialog draft={holdDraft} places={places} onClose={() => setHoldDraft(null)} onSave={saveHold} onDelete={delHold} />
    </div>
  );
}
