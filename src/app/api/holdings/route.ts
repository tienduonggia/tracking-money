import { handler, json, readJson, requireSession, HttpError } from "@/lib/http.ts";
import { createHolding, listHoldings } from "@/lib/repo.ts";
import { parseHolding, ValidationError } from "@/lib/validate.ts";

export const GET = handler(async (req) => {
  const s = await requireSession(req);
  return json(await listHoldings(s.userId));
});

export const POST = handler(async (req) => {
  const s = await requireSession(req);
  const body = await readJson<Record<string, unknown>>(req);
  try {
    return json(await createHolding(s.userId, parseHolding(body)), 201);
  } catch (e) {
    if (e instanceof ValidationError) throw new HttpError(400, e.message);
    throw e;
  }
});
