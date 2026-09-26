"use client";
// Client-side API wrapper. Token lưu ở localStorage (website) — Mini App đăng nhập lại mỗi lần mở bằng initData.

const KEY = "sts_token";

export const tokenStore = {
  get(): string | null {
    try { return localStorage.getItem(KEY); } catch { return null; }
  },
  set(t: string) {
    try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
  },
  clear() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: Record<string, unknown>) {
    super(message);
  }
}

let memToken: string | null = null;
export const setToken = (t: string | null, persist = true) => {
  memToken = t;
  if (t && persist) tokenStore.set(t);
  if (!t) tokenStore.clear();
};
export const getToken = () => memToken ?? tokenStore.get();

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const t = getToken();
  if (t) headers.set("authorization", `Bearer ${t}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(path, { ...init, headers, body, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || `Lỗi ${res.status}`, data);
  return data as T;
}

/* Telegram WebApp typing (phần dùng tới) */
export interface TgWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  platform: string;
  ready(): void;
  expand(): void;
  onEvent(ev: string, cb: () => void): void;
  HapticFeedback?: { notificationOccurred(t: "success" | "error" | "warning"): void };
}
export const tg = (): TgWebApp | null => {
  const w = typeof window !== "undefined" ? (window as unknown as { Telegram?: { WebApp?: TgWebApp } }) : null;
  const app = w?.Telegram?.WebApp;
  return app && app.initData ? app : null;
};
