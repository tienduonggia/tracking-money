import { handler, json, readJson, requireSession, HttpError } from "@/lib/http.ts";
import { deleteDeposit, updateDeposit } from "@/lib/repo.ts";
import { parseDeposit, ValidationError } from "@/lib/validate.ts";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;

export const PUT = handler(async (req: Request, ctx: Ctx) => {
  const s = await requireSession(req);
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new HttpError(404, "Không tìm thấy sổ");
  const body = await readJson<Record<string, unknown>>(req);
  let input;
  try {
    input = parseDeposit(body);
  } catch (e) {
    if (e instanceof ValidationError) throw new HttpError(400, e.message);
    throw e;
  }
  const r = await updateDeposit(s.userId, id, input);
  if (!r) throw new HttpError(404, "Không tìm thấy sổ");
  return json(r);
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const s = await requireSession(req);
  const { id } = await ctx.params;
  if (!UUID.test(id) || !(await deleteDeposit(s.userId, id))) throw new HttpError(404, "Không tìm thấy sổ");
  return json({ ok: true });
});
