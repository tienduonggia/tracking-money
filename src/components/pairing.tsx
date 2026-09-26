"use client";
import { useEffect, useRef, useState } from "react";
import { api, setToken } from "@/lib/client.ts";
import { Modal } from "./ui.tsx";

const fmtCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

/* ---------- Trên website: tạo mã, chờ Mini App xác nhận ---------- */
export function PairLogin({ onLogin }: { onLogin: (name: string) => void }) {
  const [st, setSt] = useState<{ code: string; secret: string; until: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const short = process.env.NEXT_PUBLIC_TELEGRAM_APP_SHORTNAME;

  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  useEffect(() => stop, []);

  const start = async () => {
    stop();
    setMsg(null);
    try {
      const r = await api<{ code: string; secret: string; ttlMinutes: number }>("/api/auth/pair/start", { method: "POST" });
      const until = Date.now() + r.ttlMinutes * 60_000;
      setSt({ code: r.code, secret: r.secret, until });
      timer.current = setInterval(async () => {
        if (Date.now() > until) { stop(); setSt(null); setMsg("Mã đã hết hạn. Tạo mã mới."); return; }
        try {
          const p = await api<{ status: string; token?: string; user?: { name: string } }>("/api/auth/pair/poll", { method: "POST", json: { code: r.code, secret: r.secret } });
          if (p.status === "approved" && p.token) { stop(); setToken(p.token); onLogin(p.user?.name || ""); }
          else if (p.status === "expired") { stop(); setSt(null); setMsg("Mã đã hết hạn hoặc tài khoản không được phép. Tạo mã mới."); }
        } catch { /* mạng chập chờn: thử lại lượt sau */ }
      }, 2000);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const link = st && bot ? (short ? `https://t.me/${bot}/${short}?startapp=login_${st.code}` : `https://t.me/${bot}`) : null;

  return (
    <div className="pair">
      {!st ? (
        <button className="btn primary" onClick={start}>Đăng nhập bằng mã (xác nhận trên điện thoại)</button>
      ) : (
        <>
          <div className="pair-code num" aria-live="polite">{fmtCode(st.code)}</div>
          <ol className="pair-steps">
            <li>Trên điện thoại, mở bot {bot ? <b>@{bot}</b> : null} → bấm nút menu để mở app.</li>
            <li>Kéo xuống cuối trang, bấm <b>Đăng nhập máy tính</b>, nhập mã trên.</li>
            <li>Trang này tự vào sau khi bạn xác nhận.</li>
          </ol>
          {link && <a className="btn" href={link} target="_blank" rel="noreferrer">{short ? "Mở app trong Telegram (tự điền mã)" : "Mở bot trong Telegram"}</a>}
          <p className="note">Đang chờ xác nhận… Mã hết hạn sau 10 phút.</p>
        </>
      )}
      {msg && <div className="err">{msg}</div>}
    </div>
  );
}

/* ---------- Trong Mini App: nhập mã để cho trình duyệt đăng nhập ---------- */
export function ApproveDialog({ open, initialCode, onClose, toast }: {
  open: boolean; initialCode: string; onClose: () => void; toast: (m: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      {open && <ApproveForm initialCode={initialCode} onClose={onClose} toast={toast} />}
    </Modal>
  );
}

function ApproveForm({ initialCode, onClose, toast }: { initialCode: string; onClose: () => void; toast: (m: string) => void }) {
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api("/api/auth/pair/approve", { method: "POST", json: { code: clean } });
      toast("Đã cho phép đăng nhập trên máy tính");
      onClose();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <>
      <h3>Đăng nhập trên máy tính</h3>
      <p className="note" style={{ margin: 0 }}>Nhập mã 8 ký tự đang hiện trên trang đăng nhập của máy tính. Chỉ nhập mã do chính bạn tạo.</p>
      <label className="f">Mã đăng nhập
        <input id="pair_code" autoFocus autoCapitalize="characters" autoComplete="off" className="num" value={code}
          style={{ fontSize: 22, letterSpacing: ".15em", textAlign: "center" }}
          onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH" />
      </label>
      {err && <div className="neg">{err}</div>}
      <div className="dlg-actions">
        <button type="button" className="btn" onClick={onClose}>Huỷ</button>
        <button type="button" className="btn primary" disabled={clean.length !== 8 || busy} onClick={submit}>{busy ? "Đang xác nhận…" : "Cho phép đăng nhập"}</button>
      </div>
    </>
  );
}
