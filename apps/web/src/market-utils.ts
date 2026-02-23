const SYMBOL_REGEX = /^[A-Z0-9.^=:-]{1,15}$/;

export function normalizeWatchlist(symbols: string[]): string[] {
  const unique = new Set<string>();

  for (const symbol of symbols) {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized || !SYMBOL_REGEX.test(normalized)) {
      continue;
    }

    unique.add(normalized);
    if (unique.size >= 12) {
      break;
    }
  }

  return [...unique];
}

export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: value >= 1000 ? 0 : 2
  }).format(value);
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatCompactNumber(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value);
}

export function buildSparklinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) {
    return '';
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}
