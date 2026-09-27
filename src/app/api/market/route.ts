import { handler, json, readJson, requireSession, HttpError } from "@/lib/http.ts";
import { listMarket, upsertMarket } from "@/lib/repo.ts";
import { parseMarketPrice, ValidationError } from "@/lib/validate.ts";

export const GET = handler(async (req) => json(await listMarket((await requireSession(req)).userId)));

export const POST = handler(async (req) => {
  const s = await requireSession(req);
  const body = await readJson<Record<string, unknown>>(req);
  try {
    return json(await upsertMarket(s.userId, parseMarketPrice(body)), 201);
  } catch (e) {
    if (e instanceof ValidationError) throw new HttpError(400, e.message);
    throw e;
  }
});
