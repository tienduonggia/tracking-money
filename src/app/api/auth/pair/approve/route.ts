import { handler, json, readJson, requireSession, HttpError } from "@/lib/http.ts";
import { approvePairing, normCode } from "@/lib/pair.ts";

/** Gọi từ Mini App (đã đăng nhập) để cho phép một trình duyệt đăng nhập. */
export const POST = handler(async (req) => {
  const s = await requireSession(req);
  const { code } = await readJson<{ code?: string }>(req);
  const c = normCode(code);
  if (c.length !== 8) throw new HttpError(400, "Mã gồm 8 ký tự");
  if (!(await approvePairing(c, s.userId, s.name))) throw new HttpError(404, "Mã không đúng hoặc đã hết hạn");
  return json({ ok: true });
});
