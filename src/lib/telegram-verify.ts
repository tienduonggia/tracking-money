// Xác thực dữ liệu đăng nhập Telegram. Thuần Node crypto, test được độc lập.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

const MAX_AGE_S = 24 * 3600;

/**
 * Mini App: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * secret = HMAC_SHA256(key="WebAppData", msg=bot_token); hash = HMAC_SHA256(key=secret, msg=data_check_string)
 */
export function verifyWebAppInitData(initData: string, botToken: string, nowS = Math.floor(Date.now() / 1000)): TgUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dcs = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calc = createHmac("sha256", secret).update(dcs).digest("hex");
  if (!safeEq(calc, hash)) return null;
  const authDate = Number(params.get("auth_date"));
  if (!authDate || nowS - authDate > MAX_AGE_S) return null;
  try {
    const u = JSON.parse(params.get("user") || "null");
    return u && typeof u.id === "number" ? u : null;
  } catch {
    return null;
  }
}

/**
 * Login Widget: https://core.telegram.org/widgets/login#checking-authorization
 * secret = SHA256(bot_token); hash = HMAC_SHA256(key=secret, msg=data_check_string)
 */
export function verifyLoginWidget(data: Record<string, unknown>, botToken: string, nowS = Math.floor(Date.now() / 1000)): TgUser | null {
  const hash = typeof data.hash === "string" ? data.hash : "";
  if (!hash) return null;
  const dcs = Object.keys(data)
    .filter((k) => k !== "hash" && data[k] !== undefined && data[k] !== null)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  const calc = createHmac("sha256", secret).update(dcs).digest("hex");
  if (!safeEq(calc, hash)) return null;
  const authDate = Number(data.auth_date);
  if (!authDate || nowS - authDate > MAX_AGE_S) return null;
  const id = Number(data.id);
  if (!Number.isSafeInteger(id)) return null;
  return { id, first_name: data.first_name as string, last_name: data.last_name as string, username: data.username as string };
}
