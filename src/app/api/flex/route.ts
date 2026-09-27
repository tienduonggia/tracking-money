import { handler, json, readJson, requireSession, HttpError } from "@/lib/http.ts";
import { createFlex, listFlex } from "@/lib/repo.ts";
import { parseFlex, ValidationError } from "@/lib/validate.ts";

export const GET = handler(async (req) => {
  const s = await requireSession(req);
  return json(await listFlex(s.userId));
});

export const POST = handler(async (req) => {
  const s = await requireSession(req);
  const body = await readJson<Record<string, unknown>>(req);
  try {
    return json(await createFlex(s.userId, parseFlex(body)), 201);
  } catch (e) {
    if (e instanceof ValidationError) throw new HttpError(400, e.message);
    throw e;
  }
});
