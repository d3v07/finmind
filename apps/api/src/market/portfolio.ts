/**
 * Portfolio performance calculator for FinMind.
 *
 * Computes standard return metrics and risk-adjusted statistics over
 * a series of portfolio valuations. All calculations are pure functions
 * so they can be called from any transport layer (tRPC, REST, CLI).
 */

export interface ValuationPoint {
  date: string;    // ISO date, e.g. "2024-01-15"
  totalValue: number;
  cashFlow?: number; // positive = deposit, negative = withdrawal
}

export interface PortfolioMetrics {
  startValue: number;
  endValue: number;
  absoluteReturn: number;
  percentReturn: number;      // simple return %
  cagr: number;               // annualised geometric return %
  annualisedVolatility: number; // std dev of daily returns, annualised
  sharpeRatio: number;        // using risk-free rate
  maxDrawdown: number;        // peak-to-trough as a fraction
  winRate: number;            // fraction of positive-return days
  tradingDays: number;
}

const RISK_FREE_RATE_ANNUAL = 0.05; // 5 % p.a.
const TRADING_DAYS_PER_YEAR = 252;

function dailyReturns(valuations: ValuationPoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < valuations.length; i++) {
    const prev = valuations[i - 1].totalValue;
    const curr = valuations[i].totalValue;
    if (prev > 0) returns.push((curr - prev) / prev);
  }
  return returns;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[], avg: number): number {
  if (xs.length < 2) return 0;
  const variance = xs.reduce((sum, x) => sum + (x - avg) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function maxDrawdown(valuations: ValuationPoint[]): number {
  let peak = -Infinity;
  let maxDD = 0;
  for (const v of valuations) {
    if (v.totalValue > peak) peak = v.totalValue;
    const dd = peak > 0 ? (peak - v.totalValue) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

/**
 * Compute portfolio performance metrics from a time-series of valuations.
 * Requires at least 2 data points.
 */
export function computePortfolioMetrics(
  valuations: ValuationPoint[],
  riskFreeRateAnnual = RISK_FREE_RATE_ANNUAL
): PortfolioMetrics {
  if (valuations.length < 2) {
    throw new Error('At least two valuation points are required');
  }

  const sorted = [...valuations].sort((a, b) => a.date.localeCompare(b.date));
  const startValue = sorted[0].totalValue;
  const endValue = sorted[sorted.length - 1].totalValue;
  const tradingDays = sorted.length - 1;
  const yearsHeld = tradingDays / TRADING_DAYS_PER_YEAR;

  const absoluteReturn = endValue - startValue;
  const percentReturn = startValue > 0 ? (absoluteReturn / startValue) * 100 : 0;
  const cagr =
    startValue > 0 && yearsHeld > 0
      ? (Math.pow(endValue / startValue, 1 / yearsHeld) - 1) * 100
      : 0;

  const returns = dailyReturns(sorted);
  const avgDailyReturn = mean(returns);
  const dailyVol = stddev(returns, avgDailyReturn);
  const annualisedVolatility = dailyVol * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;

  const riskFreeDaily = riskFreeRateAnnual / TRADING_DAYS_PER_YEAR;
  const sharpeRatio =
    dailyVol > 0
      ? ((avgDailyReturn - riskFreeDaily) / dailyVol) * Math.sqrt(TRADING_DAYS_PER_YEAR)
      : 0;

  const winRate =
    returns.length > 0 ? returns.filter((r) => r > 0).length / returns.length : 0;

  return {
    startValue,
    endValue,
    absoluteReturn,
    percentReturn: parseFloat(percentReturn.toFixed(4)),
    cagr: parseFloat(cagr.toFixed(4)),
    annualisedVolatility: parseFloat(annualisedVolatility.toFixed(4)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(4)),
    maxDrawdown: parseFloat(maxDrawdown(sorted).toFixed(4)),
    winRate: parseFloat(winRate.toFixed(4)),
    tradingDays,
  };
}
