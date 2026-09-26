import { handler, json, requireSession } from "@/lib/http.ts";
import { listDeposits, listHoldings } from "@/lib/repo.ts";

export const GET = handler(async (req) => {
  const s = await requireSession(req);
  const [deposits, holdings] = await Promise.all([listDeposits(s.userId), listHoldings(s.userId)]);
  return json({ exportedAt: new Date().toISOString(), deposits, holdings });
});
