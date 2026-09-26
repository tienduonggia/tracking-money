"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { fmt, parseMoney } from "@/lib/calc.ts";

/* ---------- Modal: bọc <dialog> native ---------- */
export function Modal({ open, onClose, children }: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="dlg-body">{open ? children : null}</div>
    </dialog>
  );
}

/* ---------- Money input: hiển thị 1.234.567, trả về number ---------- */
export function MoneyInput({ id, value, onChange, required, placeholder }: {
  id: string;
  value: number | null;
  onChange: (n: number | null) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      inputMode="numeric"
      className="num"
      required={required}
      placeholder={placeholder}
      value={value === null || Number.isNaN(value) ? "" : fmt(value)}
      onChange={(e) => onChange(e.target.value.trim() === "" ? null : parseMoney(e.target.value))}
    />
  );
}

/* ---------- Toast ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  );
}

/* ---------- Confirm ---------- */
export function Confirm({ open, title, text, onOk, onClose, okLabel = "Đồng ý" }: {
  open: boolean; title: string; text: string; onOk: () => void; onClose: () => void; okLabel?: string;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <h3>{title}</h3>
      <p style={{ margin: 0 }}>{text}</p>
      <div className="dlg-actions">
        <button type="button" className="btn" onClick={onClose}>Huỷ</button>
        <button type="button" className="btn primary" onClick={() => { onOk(); onClose(); }}>{okLabel}</button>
      </div>
    </Modal>
  );
}

/* ---------- Tooltip (dùng data-tip) ---------- */
export function TipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const t = (e.target as Element | null)?.closest?.("[data-tip]");
      if (!t) return setTip(null);
      setTip({ text: t.getAttribute("data-tip") || "", x: Math.min(e.clientX + 12, window.innerWidth - 220), y: e.clientY + 14 });
    };
    document.addEventListener("mousemove", move);
    return () => document.removeEventListener("mousemove", move);
  }, []);
  return tip ? <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div> : null;
}
