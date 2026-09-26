import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, accrued, expGross, pd, today, yearStats, accrualInRange } from "./calc.ts";
import { parseDeposit, parseHolding, ValidationError } from "./validate.ts";
import type { Deposit } from "./types.ts";

const dep = (o: Partial<Deposit>): Deposit => ({
  id: "x", institution: "MB", label: "", principal: 100_000_000, rate: 5, termMonths: 12, openDate: "2025-01-01",
  maturityDate: "2026-01-01", earlyRate: 0.5, taxPct: 0, note: "", status: "active", closeDate: null, closeType: null,
  interest: null, tax: null, fee: null, renewedFrom: null, ...o,
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
  assert.equal(Y.months[2], 2_000_000 - 7500); // tháng 3
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
