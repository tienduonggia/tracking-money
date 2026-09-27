import { handler, json, readJson, requireSession, HttpError } from "@/lib/http.ts";
import { deleteMarket, upsertMarket } from "@/lib/repo.ts";
import { parseMarketPrice, ValidationError } from "@/lib/validate.ts";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;

export const PUT = handler(async (req: Request, ctx: Ctx) => {
  const s = await requireSession(req);
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new HttpError(404, "Không tìm thấy dòng giá");
  const body = await readJson<Record<string, unknown>>(req);
  try {
    return json(await upsertMarket(s.userId, parseMarketPrice(body), id));
  } catch (e) {
    if (e instanceof ValidationError) throw new HttpError(400, e.message);
    throw e;
  }
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const s = await requireSession(req);
  const { id } = await ctx.params;
  if (!UUID.test(id) || !(await deleteMarket(s.userId, id))) throw new HttpError(404, "Không tìm thấy dòng giá");
  return json({ ok: true });
});
