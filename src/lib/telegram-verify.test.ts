import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { verifyLoginWidget, verifyWebAppInitData } from "./telegram-verify.ts";

const BOT = "123456:TEST_TOKEN";
const now = 1_790_000_000;

function signWebApp(fields: Record<string, string>, token = BOT) {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

test("webapp: chữ ký hợp lệ trả về user", () => {
  const init = signWebApp({ auth_date: String(now - 60), query_id: "AAE", user: JSON.stringify({ id: 42, first_name: "Roy" }) });
  assert.deepEqual(verifyWebAppInitData(init, BOT, now), { id: 42, first_name: "Roy" });
});
test("webapp: sai token / bị sửa / hết hạn bị từ chối", () => {
  const fields = { auth_date: String(now - 60), user: JSON.stringify({ id: 42 }) };
  assert.equal(verifyWebAppInitData(signWebApp(fields, "999:OTHER"), BOT, now), null);
  const tampered = signWebApp(fields).replace("42", "43");
  assert.equal(verifyWebAppInitData(tampered, BOT, now), null);
  const old = signWebApp({ ...fields, auth_date: String(now - 2 * 86400) });
  assert.equal(verifyWebAppInitData(old, BOT, now), null);
  assert.equal(verifyWebAppInitData("user=x", BOT, now), null);
});

test("widget: chữ ký hợp lệ / không hợp lệ", () => {
  const data: Record<string, unknown> = { id: 42, first_name: "Roy", username: "roy", auth_date: now - 10 };
  const dcs = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join("\n");
  const secret = createHash("sha256").update(BOT).digest();
  data.hash = createHmac("sha256", secret).update(dcs).digest("hex");
  assert.equal(verifyLoginWidget(data, BOT, now)?.id, 42);
  assert.equal(verifyLoginWidget({ ...data, id: 43 }, BOT, now), null);
  assert.equal(verifyLoginWidget(data, BOT, now + 3 * 86400), null);
});
