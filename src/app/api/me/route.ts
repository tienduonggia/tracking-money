import { handler, json, requireSession } from "@/lib/http.ts";

export const GET = handler(async (req) => json(await requireSession(req)));
