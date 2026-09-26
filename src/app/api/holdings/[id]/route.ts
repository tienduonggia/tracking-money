import { handler, json, readJson, requireSession, HttpError } from "@/lib/http.ts";
import { deleteHolding, updateHolding } from "@/lib/repo.ts";
import { parseHolding, ValidationError } from "@/lib/validate.ts";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;

export const PUT = handler(async (req: Request, ctx: Ctx) => {
  const s = await requireSession(req);
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new HttpError(404, "Không tìm thấy tài sản");
  const body = await readJson<Record<string, unknown>>(req);
  let input;
  try {
    input = parseHolding(body);
  } catch (e) {
    if (e instanceof ValidationError) throw new HttpError(400, e.message);
    throw e;
  }
  const r = await updateHolding(s.userId, id, input);
  if (!r) throw new HttpError(404, "Không tìm thấy tài sản");
  return json(r);
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const s = await requireSession(req);
  const { id } = await ctx.params;
  if (!UUID.test(id) || !(await deleteHolding(s.userId, id))) throw new HttpError(404, "Không tìm thấy tài sản");
  return json({ ok: true });
});
