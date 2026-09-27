import { handler, json, requireSession } from "@/lib/http.ts";
import { listDeposits, listFlex, listHoldings } from "@/lib/repo.ts";

export const GET = handler(async (req) => {
  const s = await requireSession(req);
  const [deposits, holdings, flex] = await Promise.all([listDeposits(s.userId), listHoldings(s.userId), listFlex(s.userId)]);
  return json({ exportedAt: new Date().toISOString(), deposits, holdings, flex });
});
