import { describe, expect, test } from 'bun:test';
import {
  buildSparklinePath,
  formatCompactNumber,
  formatCurrency,
  formatPercent,
  normalizeWatchlist
} from './market-utils.js';

describe('market utils', () => {
  test('normalizes and deduplicates watchlist symbols', () => {
    expect(normalizeWatchlist(['aapl', 'msft', 'AAPL', 'bad$$', 'spy'])).toEqual([
      'AAPL',
      'MSFT',
      'SPY'
    ]);
  });

  test('formats currency and percent values', () => {
    expect(formatCurrency(182.43)).toBe('$182.43');
    expect(formatPercent(1.234)).toBe('+1.23%');
    expect(formatPercent(-0.876)).toBe('-0.88%');
  });

  test('formats compact number with null handling', () => {
    expect(formatCompactNumber(2_450_000)).toBe('2.5M');
    expect(formatCompactNumber(null)).toBe('n/a');
  });

  test('creates sparkline path string', () => {
    const path = buildSparklinePath([10, 15, 12, 20], 100, 50);
    expect(path.split(' ')).toHaveLength(4);
    expect(path.includes(',')).toBe(true);
  });
});
