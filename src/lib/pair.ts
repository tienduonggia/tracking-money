import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { sql } from "./db.ts";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // bỏ 0/O/1/I dễ nhầm
export const CODE_TTL_MIN = 10;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const normCode = (c: unknown) => (typeof c === "string" ? c.toUpperCase().replace(/[^A-Z0-9]/g, "") : "");

export async function startPairing() {
  const s = sql();
  await s`delete from login_codes where created_at < now() - interval '1 day'`;
  const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const secret = randomBytes(32).toString("hex");
  await s`insert into login_codes (code, secret_hash) values (${code}, ${sha(secret)})`;
  return { code, secret, ttlMinutes: CODE_TTL_MIN };
}

/** Mini App (đã đăng nhập) xác nhận mã. */
export async function approvePairing(code: string, userId: number, name: string) {
  const r = await sql()`update login_codes set user_id = ${userId}, user_name = ${name}
    where code = ${code} and user_id is null and not consumed
      and created_at > now() - make_interval(mins => ${CODE_TTL_MIN})`;
  return r.count > 0;
}

/** Trình duyệt hỏi kết quả. Trả user một lần duy nhất (consume). */
export async function pollPairing(code: string, secret: string) {
  const s = sql();
  const [row] = await s`select user_id, user_name, consumed, created_at > now() - make_interval(mins => ${CODE_TTL_MIN}) as fresh
    from login_codes where code = ${code} and secret_hash = ${sha(secret)}`;
  if (!row || !row.fresh || row.consumed) return { status: "expired" as const };
  if (row.user_id === null) return { status: "pending" as const };
  const r = await s`update login_codes set consumed = true where code = ${code} and not consumed`;
  if (r.count === 0) return { status: "expired" as const };
  return { status: "approved" as const, userId: Number(row.user_id), name: row.user_name as string };
}
