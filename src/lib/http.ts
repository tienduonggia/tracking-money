import "server-only";
import { NextResponse } from "next/server";
import { readSession, type Session } from "./auth.ts";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** Bọc route handler: bắt lỗi, trả JSON {error}. */
export function handler<A extends unknown[]>(fn: (req: Request, ...a: A) => Promise<Response>) {
  return async (req: Request, ...a: A) => {
    try {
      return await fn(req, ...a);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Lỗi máy chủ" }, 500);
    }
  };
}

export async function requireSession(req: Request): Promise<Session> {
  const s = await readSession(req);
  if (!s) throw new HttpError(401, "Chưa đăng nhập");
  return s;
}

export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Body không phải JSON hợp lệ");
  }
}
