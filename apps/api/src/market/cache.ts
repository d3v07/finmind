/**
 * In-memory TTL cache for market data snapshots.
 *
 * Wraps a MarketSnapshot keyed by the sorted symbol list. Entries expire
 * after a configurable TTL (default 60 s) so callers always get data
 * that is at most TTL seconds old without hammering Yahoo Finance.
 */

import type { MarketSnapshot } from './realtime.js';

interface Entry {
  snapshot: MarketSnapshot;
  expiresAt: number; // ms since epoch
}

export class MarketCache {
  private readonly store = new Map<string, Entry>();
  private readonly ttlMs: number;

  constructor(ttlSeconds = 60) {
    this.ttlMs = ttlSeconds * 1000;
  }

  private key(symbols: string[]): string {
    return [...symbols].sort().join(',');
  }

  get(symbols: string[]): MarketSnapshot | null {
    const entry = this.store.get(this.key(symbols));
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(this.key(symbols));
      return null;
    }
    return entry.snapshot;
  }

  set(symbols: string[], snapshot: MarketSnapshot): void {
    this.store.set(this.key(symbols), {
      snapshot,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  invalidate(symbols: string[]): void {
    this.store.delete(this.key(symbols));
  }

  clear(): void {
    this.store.clear();
  }

  /** Purge all expired entries (call periodically to reclaim memory). */
  evict(): number {
    let count = 0;
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  get size(): number {
    return this.store.size;
  }
}

// Shared singleton with a 60-second TTL
export const marketCache = new MarketCache(60);
