import { afterEach, describe, expect, test } from 'bun:test';
import {
  getMarketHistory,
  getMarketSnapshot,
  normalizeInterval,
  normalizeRange,
  normalizeSymbols
} from './realtime.js';

const originalFetch = globalThis.fetch;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('market realtime', () => {
  test('normalizes symbol input and defaults', () => {
    expect(normalizeSymbols(undefined)).toEqual(['AAPL', 'MSFT', 'NVDA', 'SPY', 'QQQ']);
    expect(normalizeSymbols(' aapl, msft, BAD$$,AAPL , spy ')).toEqual(['AAPL', 'MSFT', 'SPY']);
  });

  test('normalizes range and interval query params', () => {
    expect(normalizeRange('5d')).toBe('5d');
    expect(normalizeRange('unknown')).toBe('1d');
    expect(normalizeInterval('15m')).toBe('15m');
    expect(normalizeInterval('999m')).toBe('5m');
  });

  test('builds partial quote snapshot when symbols are missing', async () => {
    globalThis.fetch = (async () =>
      jsonResponse({
        quoteResponse: {
          result: [
            {
              symbol: 'AAPL',
              shortName: 'Apple',
              currency: 'USD',
              fullExchangeName: 'NasdaqGS',
              marketState: 'REGULAR',
              regularMarketPrice: 188.22,
              regularMarketChange: 1.5,
              regularMarketChangePercent: 0.8,
              regularMarketPreviousClose: 186.72,
              regularMarketTime: 1_737_900_000
            }
          ]
        }
      })) as unknown as typeof fetch;

    const snapshot = await getMarketSnapshot(['AAPL', 'MSFT']);

    expect(snapshot.source).toBe('yahoo-finance');
    expect(snapshot.partial).toBe(true);
    expect(snapshot.quotes).toHaveLength(1);
    expect(snapshot.quotes[0]?.symbol).toBe('AAPL');
    expect(snapshot.errors).toHaveLength(1);
    expect(snapshot.errors[0]?.symbol).toBe('MSFT');
    expect(snapshot.errors[0]?.message).toContain('chart fallback failed');
  });

  test('returns error snapshot when upstream request fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network unavailable');
    }) as unknown as typeof fetch;

    const snapshot = await getMarketSnapshot(['AAPL']);

    expect(snapshot.partial).toBe(true);
    expect(snapshot.quotes).toHaveLength(0);
    expect(snapshot.errors).toHaveLength(1);
    expect(snapshot.errors[0]?.symbol).toBe('AAPL');
    expect(snapshot.errors[0]?.message).toContain('network unavailable');
  });

  test('falls back to chart endpoint when quote endpoint is unavailable', async () => {
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input);

      if (url.includes('/v7/finance/quote')) {
        return jsonResponse({}, 503);
      }

      if (url.includes('/chart/AAPL')) {
        return jsonResponse({
          chart: {
            result: [
              {
                meta: {
                  symbol: 'AAPL',
                  shortName: 'Apple',
                  currency: 'USD',
                  exchangeName: 'NMS',
                  marketState: 'REGULAR',
                  chartPreviousClose: 100
                },
                timestamp: [1_737_900_000, 1_737_900_060],
                indicators: {
                  quote: [
                    {
                      close: [101, 105],
                      volume: [1000, 1500]
                    }
                  ]
                }
              }
            ],
            error: null
          }
        });
      }

      return jsonResponse({
        chart: {
          result: [],
          error: {
            description: 'symbol not found'
          }
        }
      });
    }) as unknown as typeof fetch;

    const snapshot = await getMarketSnapshot(['AAPL', 'MSFT']);

    expect(snapshot.quotes).toHaveLength(1);
    expect(snapshot.quotes[0]?.symbol).toBe('AAPL');
    expect(snapshot.quotes[0]?.price).toBe(105);
    expect(snapshot.quotes[0]?.changePercent).toBe(5);
    expect(snapshot.partial).toBe(true);
    expect(snapshot.errors).toHaveLength(1);
    expect(snapshot.errors[0]?.symbol).toBe('MSFT');
    expect(snapshot.errors[0]?.message).toContain('chart fallback failed');
  });

  test('builds intraday market history points', async () => {
    globalThis.fetch = (async () =>
      jsonResponse({
        chart: {
          result: [
            {
              meta: {
                symbol: 'AAPL',
                currency: 'USD',
                exchangeName: 'NMS'
              },
              timestamp: [1_737_900_000, 1_737_900_300, 1_737_900_600],
              indicators: {
                quote: [
                  {
                    close: [188, null, 189.5],
                    volume: [1000, 1100, 1200]
                  }
                ]
              }
            }
          ],
          error: null
        }
      })) as unknown as typeof fetch;

    const history = await getMarketHistory('AAPL', { range: '1d', interval: '5m' });

    expect(history.symbol).toBe('AAPL');
    expect(history.points).toHaveLength(2);
    expect(history.points[0]?.price).toBe(188);
    expect(history.points[1]?.price).toBe(189.5);
  });

  test('rejects invalid symbols in history endpoint', async () => {
    await expect(getMarketHistory('$$$')).rejects.toThrow('Invalid symbol');
  });
});
