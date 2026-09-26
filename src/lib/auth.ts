import "server-only";
import { SignJWT, jwtVerify } from "jose";
import type { TgUser } from "./telegram-verify.ts";

const enc = new TextEncoder();
const SESSION_DAYS = 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET phải dài ít nhất 32 ký tự");
  return enc.encode(s);
}

export function allowedIds(): Set<number> {
  return new Set(
    (process.env.ALLOWED_TELEGRAM_IDS || "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isSafeInteger(n) && n > 0),
  );
}

export async function issueToken(u: TgUser): Promise<string> {
  return new SignJWT({ name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(u.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export interface Session {
  userId: number;
  name: string;
}

/** Đọc Bearer token. Trả về null nếu thiếu/sai/hết hạn hoặc id không còn trong allowlist. */
export async function readSession(req: Request): Promise<Session | null> {
  const h = req.headers.get("authorization") || "";
  const m = /^Bearer (.+)$/.exec(h);
  if (!m) return null;
  try {
    const { payload } = await jwtVerify(m[1], secret(), { algorithms: ["HS256"] });
    const userId = Number(payload.sub);
    if (!allowedIds().has(userId)) return null;
    return { userId, name: String(payload.name || "") };
  } catch {
    return null;
  }
}
