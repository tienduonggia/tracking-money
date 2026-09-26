import { handler, json } from "@/lib/http.ts";
import { startPairing } from "@/lib/pair.ts";

export const POST = handler(async () => json(await startPairing()));
