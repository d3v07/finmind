import { describe, test, expect } from 'bun:test';
import { computePortfolioMetrics } from './portfolio.js';

describe('computePortfolioMetrics', () => {
  const flatSeries = Array.from({ length: 30 }, (_, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    totalValue: 10000,
  }));

  const growingSeries = Array.from({ length: 252 }, (_, i) => ({
    date: new Date(2024, 0, i + 1).toISOString().slice(0, 10),
    totalValue: 10000 * (1 + i * 0.001), // ~25% total growth
  }));

  test('throws on fewer than 2 points', () => {
    expect(() =>
      computePortfolioMetrics([{ date: '2024-01-01', totalValue: 100 }])
    ).toThrow();
  });

  test('returns zero returns on flat series', () => {
    const m = computePortfolioMetrics(flatSeries);
    expect(m.percentReturn).toBe(0);
    expect(m.absoluteReturn).toBe(0);
    expect(m.annualisedVolatility).toBe(0);
    expect(m.sharpeRatio).toBe(0);
    expect(m.maxDrawdown).toBe(0);
    expect(m.winRate).toBe(0);
  });

  test('computes positive return on growing series', () => {
    const m = computePortfolioMetrics(growingSeries);
    expect(m.percentReturn).toBeGreaterThan(0);
    expect(m.cagr).toBeGreaterThan(0);
    expect(m.absoluteReturn).toBeGreaterThan(0);
  });

  test('win rate is 1 on monotonically increasing series', () => {
    const m = computePortfolioMetrics(growingSeries);
    expect(m.winRate).toBe(1);
  });

  test('max drawdown is zero on monotonically increasing series', () => {
    const m = computePortfolioMetrics(growingSeries);
    expect(m.maxDrawdown).toBe(0);
  });

  test('reports correct trading days', () => {
    const m = computePortfolioMetrics(growingSeries);
    expect(m.tradingDays).toBe(251); // 252 points → 251 intervals
  });

  test('sorts series by date before computing', () => {
    const reversed = [...growingSeries].reverse();
    const normal   = computePortfolioMetrics(growingSeries);
    const sorted   = computePortfolioMetrics(reversed);
    expect(sorted.percentReturn).toBeCloseTo(normal.percentReturn, 4);
  });
});
