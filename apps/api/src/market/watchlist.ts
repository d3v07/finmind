/**
 * Watchlist management for FinMind.
 *
 * A watchlist is a named set of ticker symbols belonging to a user, with
 * optional per-symbol price alert thresholds. Alerts fire when the live
 * price crosses a threshold in the specified direction.
 */

export interface PriceAlert {
  symbol:    string;
  direction: 'above' | 'below';
  threshold: number;
  note?:     string;
}

export interface WatchlistEntry {
  symbol:  string;
  addedAt: string;     // ISO-8601
  alerts:  PriceAlert[];
}

export interface Watchlist {
  id:        string;
  userId:    string;
  name:      string;
  entries:   WatchlistEntry[];
  createdAt: string;
  updatedAt: string;
}

// In-memory store keyed by userId → watchlistId → Watchlist
const store = new Map<string, Map<string, Watchlist>>();

function userStore(userId: string): Map<string, Watchlist> {
  if (!store.has(userId)) store.set(userId, new Map());
  return store.get(userId)!;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function createWatchlist(userId: string, name: string): Watchlist {
  const wl: Watchlist = {
    id:        randomId(),
    userId,
    name,
    entries:   [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  userStore(userId).set(wl.id, wl);
  return wl;
}

export function getWatchlist(userId: string, id: string): Watchlist | undefined {
  return userStore(userId).get(id);
}

export function listWatchlists(userId: string): Watchlist[] {
  return Array.from(userStore(userId).values());
}

export function addSymbol(
  userId: string,
  watchlistId: string,
  symbol: string,
  alerts: PriceAlert[] = []
): Watchlist | null {
  const wl = userStore(userId).get(watchlistId);
  if (!wl) return null;
  if (wl.entries.some((e) => e.symbol === symbol)) return wl; // already present
  wl.entries.push({ symbol: symbol.toUpperCase(), addedAt: new Date().toISOString(), alerts });
  wl.updatedAt = new Date().toISOString();
  return wl;
}

export function removeSymbol(
  userId: string,
  watchlistId: string,
  symbol: string
): Watchlist | null {
  const wl = userStore(userId).get(watchlistId);
  if (!wl) return null;
  wl.entries = wl.entries.filter((e) => e.symbol !== symbol.toUpperCase());
  wl.updatedAt = new Date().toISOString();
  return wl;
}

export function deleteWatchlist(userId: string, watchlistId: string): boolean {
  return userStore(userId).delete(watchlistId);
}

/**
 * Check which alerts are triggered given a map of current prices.
 * Returns the fired alerts grouped by symbol.
 */
export function evaluateAlerts(
  watchlist: Watchlist,
  prices: Record<string, number>
): { symbol: string; alert: PriceAlert; currentPrice: number }[] {
  const fired: { symbol: string; alert: PriceAlert; currentPrice: number }[] = [];
  for (const entry of watchlist.entries) {
    const price = prices[entry.symbol];
    if (price === undefined) continue;
    for (const alert of entry.alerts) {
      const triggered =
        (alert.direction === 'above' && price > alert.threshold) ||
        (alert.direction === 'below' && price < alert.threshold);
      if (triggered) fired.push({ symbol: entry.symbol, alert, currentPrice: price });
    }
  }
  return fired;
}
