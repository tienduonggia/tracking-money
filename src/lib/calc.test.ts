import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, accrued, days, expGross, pd, today, yearStats, accrualInRange } from "./calc.ts";
import { parseDeposit, parseHolding, ValidationError } from "./validate.ts";
import type { Deposit } from "./types.ts";

const dep = (o: Partial<Deposit>): Deposit => ({
  id: "x", institution: "MB", label: "", principal: 100_000_000, rate: 5, termMonths: 12, openDate: "2025-01-01",
  maturityDate: "2026-01-01", earlyRate: 0.5, taxPct: 0, note: "", status: "active", closeDate: null, closeType: null,
  interest: null, tax: null, fee: null, renewedFrom: null, tiers: null, payout: null, newMoney: null, ...o,
});

test("addMonths kẹp cuối tháng", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2026-08-15", 6), "2027-02-15");
  assert.equal(addMonths("2026-11-30", 3), "2027-02-28");
});

test("lãi đơn theo ngày/365", () => {
  const d = dep({});
  assert.equal(Math.round(expGross(d)), 5_000_000); // 365 ngày × 5%
  assert.equal(Math.round(accrued(d, pd("2025-07-02"))), Math.round(100e6 * 0.05 * 182 / 365));
  assert.equal(accrued(d, pd("2030-01-01")), expGross(d)); // không vượt đáo hạn
});

test("today() theo giờ VN", () => {
  assert.equal(today(new Date("2026-09-26T18:00:00Z")), pd("2026-09-27")); // 01:00 sáng VN
  assert.equal(today(new Date("2026-09-26T16:00:00Z")), pd("2026-09-26")); // 23:00 VN
});

test("yearStats: lãi ròng, thuế, phí, lãi mất do rút sớm", () => {
  const closed = dep({ status: "closed", closeDate: "2026-03-01", closeType: "matured", openDate: "2025-09-01", maturityDate: "2026-03-01", interest: 2_000_000, tax: 2000, fee: 5500 });
  const early = dep({ status: "closed", closeDate: "2026-05-01", closeType: "early", openDate: "2026-01-01", maturityDate: "2027-01-01", interest: 100_000, tax: 0, fee: 0 });
  const Y = yearStats([closed, early, dep({ openDate: "2026-01-01", maturityDate: "2027-01-01" })], "2026", pd("2026-07-01"));
  assert.equal(Y.net, 2_000_000 + 100_000 - 2000 - 5500);
  assert.equal(Y.buckets[2].value, 2_000_000 - 7500); // tháng 3
  assert.equal(Y.early, 1);
  assert.equal(Math.round(Y.lost), Math.round(100e6 * 0.05 * 120 / 365 - 100_000));
});

test("accrualInRange: sổ đã tất toán chia đều lãi thực nhận", () => {
  const d = dep({ status: "closed", openDate: "2025-12-02", closeDate: "2026-01-31", closeType: "matured", interest: 600_000 });
  // 60 ngày, 30 ngày trong 2026
  assert.equal(accrualInRange(d, pd("2026-01-01"), pd("2027-01-01"), pd("2026-06-01")), 300_000);
});

test("validate deposit", () => {
  const ok = parseDeposit({ institution: " Timo ", principal: 50_000_000, rate: 5.2, openDate: "2026-01-01", maturityDate: "2026-07-01", termMonths: 6 });
  assert.equal(ok.institution, "Timo");
  assert.equal(ok.status, "active");
  assert.equal(ok.interest, null);
  assert.throws(() => parseDeposit({ institution: "A", principal: 1, rate: 1, openDate: "2026-02-01", maturityDate: "2026-01-01" }), ValidationError);
  assert.throws(() => parseDeposit({ institution: "A", principal: 1, rate: 1, openDate: "2026-01-01", maturityDate: "2026-02-01", status: "closed" }), ValidationError);
  assert.throws(() => parseDeposit({ institution: "", principal: 1, rate: 1, openDate: "2026-01-01", maturityDate: "2026-02-01" }), ValidationError);
});

test("validate holding: cash chuẩn hoá, nguồn giá", () => {
  const c = parseHolding({ type: "cash", name: "TK", qty: 15_000_000, price: 99, cost: 1 });
  assert.equal(c.price, 1);
  assert.equal(c.cost, 15_000_000);
  assert.throws(() => parseHolding({ type: "coin", name: "BTC", qty: 1, priceSource: "http://evil" }), ValidationError);
  assert.equal(parseHolding({ type: "coin", name: "BTC", qty: 0.1, priceSource: "coingecko:bitcoin" }).priceSource, "coingecko:bitcoin");
});

/* ---------- lãi bậc thang (Topi) ---------- */
import { PRESETS, earlyInterest, currentSegment, effectiveRate, segments } from "./calc.ts";
import { parseTiers } from "./validate.ts";

const topi = (principal: number, openDate: string) => {
  const tiers = PRESETS[0].tiers;
  return dep({ principal, openDate, maturityDate: addMonths(openDate, 12), termMonths: 12, tiers, rate: 0, earlyRate: 0.5, taxPct: 5 });
};

test("Topi: khớp bảng 100 triệu trong app (91/90/92/92 ngày)", () => {
  const d = topi(100_000_000, "2025-09-26");
  assert.deepEqual(segments(d).map((s) => days(s.start, s.end)), [91, 90, 92, 92]);
  const at = (m: number) => Math.round(accrued(d, pd(addMonths(d.openDate, m))));
  assert.deepEqual([at(3), at(6), at(9), at(12)], [1_495_890, 3_123_288, 4_786_849, 6_601_644]);
  assert.equal(Math.round(expGross(d)), 6_601_644);
});

test("Topi: khoản thật 7.823.500 → lãi 516.480, thuế 25.824, nhận 8.314.156", () => {
  const d = topi(7_823_500, "2025-09-26");
  const gi = Math.round(expGross(d));
  const tax = Math.round(gi * 0.05);
  assert.equal(gi, 516_480);
  assert.equal(tax, 25_824);
  assert.equal(d.principal + gi - tax, 8_314_156);
  assert.equal(Math.round(effectiveRate(d) * 100) / 100, 6.6);
});

test("Topi: rút sớm giữ lãi các quý đã xong, quý dở tính 0,5%", () => {
  const d = topi(100_000_000, "2025-09-26");
  const t = pd(addMonths(d.openDate, 6)) + 59 * 86_400_000; // 59 ngày vào quý 3
  const want = 3_123_288 + 100e6 * 0.005 * 59 / 365;
  assert.equal(Math.round(earlyInterest(d, t)), Math.round(want));
  assert.equal(currentSegment(d, t)?.index, 2);
  // sổ lãi cố định vẫn tính 0,5% cho toàn bộ thời gian
  const flat = dep({ openDate: "2025-01-01", maturityDate: "2026-01-01", earlyRate: 0.5 });
  assert.equal(Math.round(earlyInterest(flat, pd("2025-07-01"))), Math.round(100e6 * 0.005 * 181 / 365));
});

test("validate: bậc lãi suy ra kỳ hạn, ngày đáo hạn, lãi bình quân", () => {
  const x = parseDeposit({ institution: "Topi", principal: 7_823_500, openDate: "2025-09-26", maturityDate: "2099-01-01", tiers: PRESETS[0].tiers });
  assert.equal(x.maturityDate, "2026-09-26");
  assert.equal(x.termMonths, 12);
  assert.equal(x.rate, 6.602);
  assert.throws(() => parseTiers([{ upToMonth: 6, rate: 6 }, { upToMonth: 3, rate: 7 }]), ValidationError);
  assert.equal(parseTiers([]), null);
});

test("Toàn bộ + chia lãi sổ bậc thang đã tất toán theo bậc", () => {
  const d = { ...topi(7_823_500, "2025-09-26"), status: "closed" as const, closeDate: "2026-09-26", closeType: "matured" as const, interest: 516_480, tax: 25_824, fee: 0 };
  const t = pd("2026-09-27");
  const y25 = yearStats([d], "2025", t).accrual, y26 = yearStats([d], "2026", t).accrual;
  assert.equal(Math.round(y25), 125_519);
  assert.equal(Math.round(y26), 390_961);
  const all = yearStats([d], "all", t);
  assert.equal(Math.round(all.accrual), 516_480);
  assert.equal(all.net, 490_656);
  assert.deepEqual(all.buckets.map((b) => [b.label, b.value]), [["2025", 0], ["2026", 490_656]]);
  // sổ cố định vẫn chia đều theo ngày
  const flat = dep({ status: "closed", openDate: "2025-12-02", closeDate: "2026-01-31", closeType: "matured", interest: 600_000 });
  assert.equal(Math.round(yearStats([flat], "2026", t).accrual), 300_000);
});

import { pendingPayouts } from "./calc.ts";
test("pendingPayouts: chỉ sổ cũ đã tất toán, chưa ghi, không tái tục", () => {
  const a = dep({ id: "a", status: "closed", closeDate: "2026-01-01", closeType: "matured", interest: 1 });
  const b = dep({ id: "b", status: "closed", closeDate: "2026-01-01", closeType: "matured", interest: 1, payout: "cash" });
  const c = dep({ id: "c", status: "closed", closeDate: "2026-01-01", closeType: "matured", interest: 1 });
  const cNew = dep({ id: "c2", renewedFrom: "c" });
  assert.deepEqual(pendingPayouts([a, b, c, cNew, dep({ id: "act" })]).map((d) => d.id), ["a"]);
});

import { capitalOf, lifetime } from "./calc.ts";
test("lifetime: vốn không tính tiền quay vòng, lời = đã nhận + đang chạy", () => {
  const a = dep({ id: "a", principal: 100e6, status: "closed", closeDate: "2026-01-01", closeType: "matured", interest: 5e6, tax: 0, fee: 0 });
  const b = dep({ id: "b", principal: 105e6, renewedFrom: "a", openDate: "2026-01-01", maturityDate: "2027-01-01", rate: 5 }); // tái tục gốc+lãi
  const c = dep({ id: "c", principal: 20e6, newMoney: 5e6, openDate: "2026-01-01", maturityDate: "2027-01-01", rate: 0 }); // 15tr từ tiền chờ + 5tr mới
  assert.deepEqual([a, b, c].map(capitalOf), [100e6, 0, 5e6]);
  const L = lifetime([a, b, c], pd("2026-07-02"));
  assert.equal(L.capital, 105e6);
  assert.equal(L.realized, 5e6);
  assert.equal(Math.round(L.running), Math.round(105e6 * 0.05 * 182 / 365));
});

/* ---------- tích luỹ không kỳ hạn ---------- */
import { flexSim, withdrawnOut } from "./calc.ts";
import type { FlexAccount } from "./types.ts";
const flex = (o: Partial<FlexAccount>): FlexAccount => ({
  id: "f", institution: "Cake", name: "Tích luỹ", compounding: "none", taxPct: 0, note: "",
  rates: [{ from: "2026-01-01", rate: 3.65 }], txns: [], ...o,
});
const tx = (date: string, kind: "deposit" | "withdraw" | "adjust", amount: number, external = true) => ({ id: date + kind, date, kind, amount, external, note: "" });

test("flex: lãi đơn theo ngày, rút giữa chừng, đổi lãi suất", () => {
  // 3,65%/năm trên 100tr = 10.000đ/ngày
  const f = flex({ txns: [tx("2026-01-01", "deposit", 100e6), tx("2026-01-11", "withdraw", 50e6)], rates: [{ from: "2026-01-01", rate: 3.65 }, { from: "2026-01-21", rate: 7.3 }] });
  const s = flexSim(f, pd("2026-01-31"));
  // 10 ngày × 10k + 10 ngày × 5k + 10 ngày × 10k (50tr ở 7,3%)
  assert.equal(Math.round(s.interest), 100_000 + 50_000 + 100_000);
  assert.equal(Math.round(s.value), 50e6 + 250_000);
  assert.equal(s.inExt, 100e6); assert.equal(s.outExt, 50e6);
});

test("flex: nhập gốc hằng ngày cao hơn lãi đơn; hằng tháng nhập vào ngày 1", () => {
  const base = { txns: [tx("2026-01-01", "deposit", 100e6)] };
  const t = pd("2026-03-01");
  const simple = flexSim(flex(base), t).interest;
  const daily = flexSim(flex({ ...base, compounding: "daily" }), t).interest;
  const monthly = flexSim(flex({ ...base, compounding: "monthly" }), t);
  assert.ok(daily > simple && monthly.interest > simple && monthly.interest < daily);
  assert.equal(Math.round(monthly.pending), Math.round((100e6 + 310_000) * 0.0365 / 365 * 28)); // tháng 2 tính trên gốc đã cộng lãi tháng 1
});

test("flex: điều chỉnh tính vào lời; thuế trừ vào lãi", () => {
  const f = flex({ taxPct: 5, txns: [tx("2026-01-01", "deposit", 100e6), tx("2026-01-11", "adjust", -1_234)] });
  const s = flexSim(f, pd("2026-01-11"));
  assert.equal(Math.round(s.interest), Math.round(100_000 * 0.95 - 1_234));
});

test("lifetime gồm tích luỹ + rút ra đem tiêu", () => {
  const a = dep({ id: "a", principal: 100e6, status: "closed", closeDate: "2026-01-01", closeType: "matured", interest: 5e6, tax: 0, fee: 0, payout: "none" });
  assert.equal(withdrawnOut(a, [a]), 105e6);
  const f = flex({ txns: [tx("2026-01-01", "deposit", 10e6), tx("2026-01-11", "withdraw", 2e6)] });
  const L = lifetime([a], pd("2026-01-21"), [f]);
  assert.equal(L.capital, 110e6);
  assert.equal(L.withdrawn, 107e6);
  assert.equal(Math.round(L.holding), Math.round(8e6 + flexSim(f, pd("2026-01-21")).interest));
});

/* ---------- đầu tư: giá vốn bình quân ---------- */
import { position } from "./calc.ts";
test("position: mua 2 lần, giá vốn TB; bán 1 phần chốt lời", () => {
  const b = (date: string, qty: number, price: number, fee = 0) => ({ id: date, date, kind: "buy" as const, qty, price, fee, note: "" });
  const s = (date: string, qty: number, price: number, fee = 0) => ({ id: date + "s", date, kind: "sell" as const, qty, price, fee, note: "" });
  const p1 = position([b("2026-06-01", 2, 11e6), b("2026-09-01", 3, 12e6)]);
  assert.equal(p1.qty, 5); assert.equal(p1.cost, 58e6); assert.equal(p1.avg, 11.6e6);
  const p2 = position([b("2026-06-01", 2, 11e6), b("2026-09-01", 3, 12e6), s("2026-10-01", 1, 13e6)]);
  assert.equal(p2.qty, 4); assert.equal(Math.round(p2.cost), 46.4e6); assert.equal(Math.round(p2.realized), 1.4e6);
  assert.equal(Math.round(p2.avg), 11.6e6);
  // phí mua cộng vào vốn, phí bán trừ vào tiền thu
  const p3 = position([b("2026-01-01", 1, 10e6, 100_000), s("2026-02-01", 1, 11e6, 50_000)]);
  assert.equal(p3.qty, 0); assert.equal(Math.round(p3.realized), 11e6 - 50_000 - 10.1e6);
});
test("parseHoldingTxns: chặn bán vượt số lượng", async () => {
  const { parseHolding, ValidationError } = await import("./validate.ts");
  const txns = [{ date: "2026-01-01", kind: "buy", qty: 1, price: 10 }, { date: "2026-01-02", kind: "sell", qty: 2, price: 10 }];
  assert.throws(() => parseHolding({ type: "gold", name: "Nhẫn", txns }), ValidationError);
  const ok = parseHolding({ type: "gold", name: "Nhẫn", txns: [{ date: "2026-06-01", kind: "buy", qty: 2, price: 11e6 }, { date: "2026-09-01", kind: "buy", qty: 3, price: 12e6 }], priceSource: "vangtoday:DOJINHTV:chi" });
  assert.equal(ok.qty, 5); assert.equal(ok.cost, 58e6); assert.equal(ok.priceSource, "vangtoday:DOJINHTV:chi");
});

test("parseMarketPrice: key từ tên tiếng Việt, nguồn hợp lệ", async () => {
  const { parseMarketPrice, ValidationError } = await import("./validate.ts");
  const m = parseMarketPrice({ label: "Nhẫn DOJI HTV", unit: "chỉ", price: 12_500_000 });
  assert.equal(m.key, "nhan-doji-htv");
  assert.equal(parseMarketPrice({ label: "x", source: "vangtoday:DOJINHTV:chi" }).key, "vangtoday:DOJINHTV:chi");
  assert.throws(() => parseMarketPrice({ label: "x", source: "http://evil" }), ValidationError);
});

test("parseVangToday: nhiều kiểu cấu trúc", async () => {
  // prices.ts có "server-only"; kiểm tra bản sao logic qua import động bị chặn → test gián tiếp qua hàm thuần tách riêng
  const { parseVangToday } = await import("./vt.ts");
  assert.deepEqual(parseVangToday({ data: [{ type_code: "DOJINHTV", buy: 125e6, sell: 128e6 }] }).map((q) => [q.code, q.buy]), [["DOJINHTV", 125e6]]);
  assert.deepEqual(parseVangToday({ data: { type_code: "DOJINHTV", buy: 1, sell: 2 } }).map((q) => q.code), ["DOJINHTV"]);
  assert.deepEqual(parseVangToday({ data: { DOJINHTV: { buy: 1, sell: 2 }, SJ9999: { buy: 3, sell: 4 } } }).map((q) => q.code), ["DOJINHTV", "SJ9999"]);
  assert.equal(parseVangToday({ data: [{ type_code: "X", buy: 0, sell: 0 }] }).length, 0);
});
