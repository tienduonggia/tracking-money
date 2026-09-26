import { handler, json, readJson, requireSession, HttpError } from "@/lib/http.ts";
import { importAll } from "@/lib/repo.ts";
import { parseDeposit, parseHolding, ValidationError } from "@/lib/validate.ts";

/** Nhập file JSON đã xuất (từ app này hoặc từ bản artifact cũ). Thêm mới, không ghi đè. */
export const POST = handler(async (req) => {
  const s = await requireSession(req);
  const body = await readJson<{ deposits?: unknown[]; holdings?: unknown[] }>(req);
  const rawD = Array.isArray(body.deposits) ? body.deposits : [];
  const rawH = Array.isArray(body.holdings) ? body.holdings : [];
  if (rawD.length + rawH.length > 2000) throw new HttpError(400, "File quá lớn (tối đa 2000 dòng)");
  try {
    const deps = rawD.map((x, i) => {
      const r = x as Record<string, unknown>;
      // bản artifact cũ dùng field "cost"/"price" giống nhau, deposits giống nhau; chỉ khác tên vài field
      try { return parseDeposit(r); } catch (e) { throw new ValidationError(`Sổ #${i + 1}: ${(e as Error).message}`); }
    });
    const holds = rawH.map((x, i) => {
      try { return parseHolding(x as Record<string, unknown>); } catch (e) { throw new ValidationError(`Tài sản #${i + 1}: ${(e as Error).message}`); }
    });
    return json(await importAll(s.userId, deps, holds));
  } catch (e) {
    if (e instanceof ValidationError) throw new HttpError(400, e.message);
    throw e;
  }
});
