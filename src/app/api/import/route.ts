import { handler, json, readJson, requireSession, HttpError } from "@/lib/http.ts";
import { createFlex, importAll } from "@/lib/repo.ts";
import { parseDeposit, parseFlex, parseHolding, ValidationError } from "@/lib/validate.ts";

/** Nhập file JSON đã xuất (từ app này hoặc từ bản artifact cũ). Thêm mới, không ghi đè. */
export const POST = handler(async (req) => {
  const s = await requireSession(req);
  const body = await readJson<{ deposits?: unknown[]; holdings?: unknown[]; flex?: unknown[] }>(req);
  const rawF = Array.isArray(body.flex) ? body.flex : [];
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
    const flex = rawF.map((x, i) => {
      try { return parseFlex(x as Record<string, unknown>); } catch (e) { throw new ValidationError(`Tích luỹ #${i + 1}: ${(e as Error).message}`); }
    });
    const r = await importAll(s.userId, deps, holds);
    for (const f of flex) await createFlex(s.userId, f);
    return json({ ...r, flex: flex.length });
  } catch (e) {
    if (e instanceof ValidationError) throw new HttpError(400, e.message);
    throw e;
  }
});
