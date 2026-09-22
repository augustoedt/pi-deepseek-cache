import { describe, it, expect } from "vitest";
import {
  todayISO,
  calcHitRate,
  estimateSavings,
  type PricingTier,
} from "../lib/helpers.js";

// Explicit tiers — per-family pricing data lives in lib/families.ts.
const FLASH: PricingTier = {
  cacheHitPerM: 0.0028,
  cacheMissPerM: 0.14,
  outputPerM: 0.28,
};
const PRO: PricingTier = {
  cacheHitPerM: 0.003625,
  cacheMissPerM: 0.435,
  outputPerM: 0.87,
};

// ═══════════════════════════════════════════════════════════════════════════
// todayISO
// ═══════════════════════════════════════════════════════════════════════════

describe("todayISO", () => {
  it("returns a valid YYYY-MM-DD string", () => {
    const date = todayISO();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns today's date (matches JS Date)", () => {
    const expected = new Date().toISOString().split("T")[0];
    expect(todayISO()).toBe(expected);
  });

  it("produces valid month and day ranges", () => {
    const date = todayISO();
    const [year, month, day] = date.split("-").map(Number);
    expect(year).toBeGreaterThanOrEqual(2026);
    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12);
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(31);
  });

  it("returns consistent results in rapid succession", () => {
    const a = todayISO();
    const b = todayISO();
    expect(a).toBe(b);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calcHitRate
// ═══════════════════════════════════════════════════════════════════════════

describe("calcHitRate", () => {
  it("returns 0 when no tokens", () => {
    expect(calcHitRate(0, 0)).toBe(0);
    expect(calcHitRate(0, 0, 0)).toBe(0);
  });

  it("returns 100 when all cache reads", () => {
    expect(calcHitRate(1000, 0, 0)).toBe(100);
  });

  it("returns 0 when all input (no cache reads)", () => {
    expect(calcHitRate(0, 1000, 0)).toBe(0);
  });

  it("calculates mixed scenarios (no cacheWrite)", () => {
    expect(calcHitRate(500, 500)).toBe(50);
    expect(calcHitRate(750, 250)).toBe(75);
    expect(calcHitRate(900, 100)).toBe(90);
  });

  it("includes cacheWrite in denominator", () => {
    // 700 cache hits, 200 misses, 100 writes = 1000 total
    // Hit rate = 700 / 1000 = 70%
    expect(calcHitRate(700, 200, 100)).toBe(70);
  });

  it("equivalently: cacheRead + input + cacheWrite = promptTokens", () => {
    // Verifies that including cacheWrite gives the same result as
    // cacheRead / promptTokens
    expect(calcHitRate(7000, 3000, 0)).toBe(70);    // DeepSeek: write=0
    expect(calcHitRate(7000, 2000, 1000)).toBe(70); // Anthropic: write>0
  });

  it("handles large numbers", () => {
    expect(calcHitRate(1_000_000, 50_000)).toBeCloseTo(95.24, 1);
  });

  it("cacheWrite defaults to 0 when omitted", () => {
    // Backward compat: 2-arg call still works
    expect(calcHitRate(500, 500)).toBe(50);
  });

  it("handles edge cases gracefully", () => {
    expect(calcHitRate(2000, 1000, 0)).toBeGreaterThan(50);
    expect(calcHitRate(0, 0, 0)).toBe(0);
    expect(calcHitRate(100, 0, 0)).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// estimateSavings
// ═══════════════════════════════════════════════════════════════════════════

describe("estimateSavings", () => {
  it("returns zero savings for no cache reads and no input", () => {
    const result = estimateSavings(0, 0, 0, FLASH);
    expect(result.saved).toBe(0);
  });

  it("calculates savings for flash prices with known values", () => {
    // 1M cache read tokens: cacheHitCost = 1M * 0.0028 / 1M = $0.0028
    // Without cache: 1M * 0.14 / 1M = $0.14
    // Saved = $0.14 - $0.0028 = $0.1372
    const result = estimateSavings(1_000_000, 0, 0, FLASH);
    expect(result.saved).toBeCloseTo(0.1372, 4);
  });

  it("calculates savings for pro prices with known values", () => {
    const result = estimateSavings(1_000_000, 0, 0, PRO);
    expect(result.saved).toBeCloseTo(0.431375, 4);
  });

  it("pro estimates differ from flash for same token counts", () => {
    const flash = estimateSavings(500_000, 200_000, 0, FLASH);
    const pro = estimateSavings(500_000, 200_000, 0, PRO);
    expect(pro.saved).toBeGreaterThan(flash.saved);
  });

  it("includes output token costs in effectiveCost", () => {
    const noOutput = estimateSavings(100_000, 50_000, 0, FLASH);
    const withOutput = estimateSavings(100_000, 50_000, 100_000, FLASH);
    expect(withOutput.effectiveCost).toBeGreaterThan(noOutput.effectiveCost);
    // saved should be the same (output cost doesn't change with caching)
    expect(withOutput.saved).toBeCloseTo(noOutput.saved, 6);
  });
});
