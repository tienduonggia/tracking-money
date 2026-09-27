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
