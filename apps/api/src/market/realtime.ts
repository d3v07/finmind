type YahooQuoteResult = {
  symbol?: string;
  shortName?: string;
  currency?: string;
  fullExchangeName?: string;
  marketState?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketPreviousClose?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  marketCap?: number;
  regularMarketTime?: number;
};

type YahooQuoteResponse = {
  quoteResponse?: {
    result?: YahooQuoteResult[];
  };
};

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        currency?: string;
        exchangeName?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      code?: string;
      description?: string;
    } | null;
  };
};

export type MarketQuote = {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  marketState: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  marketCap: number | null;
  updatedAt: string;
};

export type MarketSnapshot = {
  asOf: string;
  source: 'yahoo-finance';
  partial: boolean;
  quotes: MarketQuote[];
  errors: Array<{
    symbol: string;
    message: string;
  }>;
};

export type MarketHistoryPoint = {
  timestamp: string;
  price: number;
  volume: number | null;
};

export type MarketHistory = {
  symbol: string;
  range: string;
  interval: string;
  currency: string;
  exchange: string;
  points: MarketHistoryPoint[];
};

const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'SPY', 'QQQ'];
const SYMBOL_REGEX = /^[A-Z0-9.^=:-]{1,15}$/;
const SUPPORTED_RANGES = new Set(['1d', '5d', '1mo']);
const SUPPORTED_INTERVALS = new Set(['1m', '2m', '5m', '15m', '30m', '60m']);

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function toIsoFromUnixSeconds(unixSeconds: number | null): string {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) {
    return new Date().toISOString();
  }

  return new Date(unixSeconds * 1000).toISOString();
}

function parseSymbolToken(token: string): string | null {
  const normalized = token.trim().toUpperCase();
  if (!normalized || !SYMBOL_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizeSymbols(input: string | undefined): string[] {
  if (!input) {
    return DEFAULT_SYMBOLS;
  }

  const seen = new Set<string>();
  for (const token of input.split(',')) {
    const symbol = parseSymbolToken(token);
    if (!symbol) {
      continue;
    }
    seen.add(symbol);
    if (seen.size >= 25) {
      break;
    }
  }

  return seen.size > 0 ? [...seen] : DEFAULT_SYMBOLS;
}

export function normalizeRange(input: string | undefined): string {
  const normalized = (input ?? '').trim().toLowerCase();
  return SUPPORTED_RANGES.has(normalized) ? normalized : '1d';
}

export function normalizeInterval(input: string | undefined): string {
  const normalized = (input ?? '').trim().toLowerCase();
  return SUPPORTED_INTERVALS.has(normalized) ? normalized : '5m';
}

async function fetchJson<T>(url: string, timeoutMs = 6500): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'FinMind/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`upstream status ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function buildMarketQuote(result: YahooQuoteResult): MarketQuote | null {
  const symbol = parseSymbolToken(result.symbol ?? '');
  const price = toFiniteNumber(result.regularMarketPrice);
  const change = toFiniteNumber(result.regularMarketChange);
  const changePercent = toFiniteNumber(result.regularMarketChangePercent);

  if (!symbol || price === null || change === null || changePercent === null) {
    return null;
  }

  return {
    symbol,
    name: (result.shortName ?? symbol).trim(),
    currency: (result.currency ?? 'USD').trim(),
    exchange: (result.fullExchangeName ?? 'Unknown').trim(),
    marketState: (result.marketState ?? 'UNKNOWN').trim(),
    price,
    change,
    changePercent,
    previousClose: toFiniteNumber(result.regularMarketPreviousClose),
    open: toFiniteNumber(result.regularMarketOpen),
    dayHigh: toFiniteNumber(result.regularMarketDayHigh),
    dayLow: toFiniteNumber(result.regularMarketDayLow),
    volume: toFiniteNumber(result.regularMarketVolume),
    marketCap: toFiniteNumber(result.marketCap),
    updatedAt: toIsoFromUnixSeconds(toFiniteNumber(result.regularMarketTime))
  };
}

export async function getMarketSnapshot(symbols: string[]): Promise<MarketSnapshot> {
  const deduped = [
    ...new Set(
      symbols
        .map((symbol) => parseSymbolToken(symbol))
        .filter((symbol): symbol is string => Boolean(symbol))
    )
  ];
  const requested = deduped.length > 0 ? deduped : DEFAULT_SYMBOLS;

  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(requested.join(','))}`;

  let payload: YahooQuoteResponse;
  try {
    payload = await fetchJson<YahooQuoteResponse>(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'upstream request failed';
    return {
      asOf: new Date().toISOString(),
      source: 'yahoo-finance',
      partial: true,
      quotes: [],
      errors: requested.map((symbol) => ({
        symbol,
        message
      }))
    };
  }

  const quoteResults = payload.quoteResponse?.result ?? [];
  const bySymbol = new Map<string, MarketQuote>();

  for (const item of quoteResults) {
    const quote = buildMarketQuote(item);
    if (quote) {
      bySymbol.set(quote.symbol, quote);
    }
  }

  const errors: MarketSnapshot['errors'] = [];
  for (const symbol of requested) {
    if (!bySymbol.has(symbol)) {
      errors.push({
        symbol,
        message: 'symbol missing from upstream response'
      });
    }
  }

  return {
    asOf: new Date().toISOString(),
    source: 'yahoo-finance',
    partial: errors.length > 0,
    quotes: requested
      .map((symbol) => bySymbol.get(symbol))
      .filter((item): item is MarketQuote => Boolean(item)),
    errors
  };
}

export async function getMarketHistory(
  symbol: string,
  options?: {
    range?: string;
    interval?: string;
  }
): Promise<MarketHistory> {
  const normalizedSymbol = parseSymbolToken(symbol);
  if (!normalizedSymbol) {
    throw new Error('Invalid symbol');
  }

  const range = normalizeRange(options?.range);
  const interval = normalizeInterval(options?.interval);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=false&events=div,splits`;

  const payload = await fetchJson<YahooChartResponse>(url);
  const result = payload.chart?.result?.[0];
  const upstreamError = payload.chart?.error;

  if (upstreamError) {
    throw new Error(upstreamError.description ?? upstreamError.code ?? 'Failed to load chart data');
  }

  if (!result) {
    throw new Error('No chart result returned');
  }

  const timestamps = result.timestamp ?? [];
  const closeSeries = result.indicators?.quote?.[0]?.close ?? [];
  const volumeSeries = result.indicators?.quote?.[0]?.volume ?? [];

  const points: MarketHistoryPoint[] = [];

  for (let index = 0; index < timestamps.length; index += 1) {
    const unixSeconds = timestamps[index];
    const close = toFiniteNumber(closeSeries[index]);

    if (close === null || !unixSeconds || !Number.isFinite(unixSeconds)) {
      continue;
    }

    points.push({
      timestamp: new Date(unixSeconds * 1000).toISOString(),
      price: close,
      volume: toFiniteNumber(volumeSeries[index])
    });
  }

  if (points.length < 2) {
    throw new Error('Not enough chart points returned');
  }

  return {
    symbol: normalizedSymbol,
    range,
    interval,
    currency: result.meta?.currency ?? 'USD',
    exchange: result.meta?.exchangeName ?? 'Unknown',
    points
  };
}
