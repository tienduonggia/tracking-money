import { handler, json, readJson, HttpError } from "@/lib/http.ts";
import { normCode, pollPairing } from "@/lib/pair.ts";
import { allowedIds, issueToken } from "@/lib/auth.ts";

export const POST = handler(async (req) => {
  const { code, secret } = await readJson<{ code?: string; secret?: string }>(req);
  if (typeof secret !== "string" || !/^[0-9a-f]{64}$/.test(secret)) throw new HttpError(400, "Thiếu secret");
  const r = await pollPairing(normCode(code), secret);
  if (r.status !== "approved") return json({ status: r.status });
  if (!allowedIds().has(r.userId)) return json({ status: "expired" });
  const token = await issueToken({ id: r.userId, first_name: r.name });
  return json({ status: "approved", token, user: { id: r.userId, name: r.name } });
});
