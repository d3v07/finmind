import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import finmindLogo from './assets/finmind-logo.svg';
import {
  buildSparklinePath,
  formatCompactNumber,
  formatCurrency,
  formatPercent,
  normalizeWatchlist
} from './market-utils';

type AuthMode = 'login' | 'register';
type QueryMode = 'guided' | 'advanced';

type User = {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  createdAt: string;
};

type AuthResponse = {
  token: string;
  user: User;
};

type MarketQuote = {
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

type MarketSnapshot = {
  asOf: string;
  source: 'yahoo-finance';
  partial: boolean;
  quotes: MarketQuote[];
  errors: Array<{
    symbol: string;
    message: string;
  }>;
};

type MarketHistoryPoint = {
  timestamp: string;
  price: number;
  volume: number | null;
};

type MarketHistory = {
  symbol: string;
  range: string;
  interval: string;
  currency: string;
  exchange: string;
  points: MarketHistoryPoint[];
};

type Session = {
  id: string;
  title: string;
};

type QueryRecord = {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  response: string | null;
  error: string | null;
  createdAt: string;
  artifacts?: {
    sources?: string[];
  };
};

class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const TOKEN_KEY = 'finmind.token';
const WATCHLIST_KEY = 'finmind.watchlist';
const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'SPY', 'AMZN'];
const INDEX_SYMBOLS = ['^GSPC', '^IXIC', '^DJI', '^VIX'];
const HISTORY_RANGES = ['1d', '5d', '1mo'] as const;

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(key);
}

function writeStorage(key: string, value: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (value === null) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, value);
}

function parseWatchlistFromStorage(): string[] {
  const raw = readStorage(WATCHLIST_KEY);
  if (!raw) {
    return DEFAULT_WATCHLIST;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return DEFAULT_WATCHLIST;
    }

    const normalized = normalizeWatchlist(
      parsed.filter((value): value is string => typeof value === 'string')
    );
    return normalized.length > 0 ? normalized : DEFAULT_WATCHLIST;
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

async function apiRequest<T>(
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'DELETE';
    token?: string;
    body?: unknown;
  }
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options?.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options?.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options?.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const raw = await response.text();
    const message = raw.trim() ? raw : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

function parseApiError(error: unknown): string {
  if (error instanceof ApiError) {
    try {
      const payload = JSON.parse(error.message) as {
        error?: {
          message?: string;
        };
      };
      return payload.error?.message ?? error.message;
    } catch {
      return error.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected error';
}

function pickQuote(snapshot: MarketSnapshot | null, symbol: string): MarketQuote | null {
  if (!snapshot) {
    return null;
  }

  return snapshot.quotes.find((quote) => quote.symbol === symbol) ?? null;
}

function formatAsOf(isoDate: string | null): string {
  if (!isoDate) {
    return 'Not updated yet';
  }

  return new Date(isoDate).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function ChartCard({ history }: { history: MarketHistory | null }) {
  if (!history || history.points.length < 2) {
    return <p className="placeholder">No intraday data yet.</p>;
  }

  const prices = history.points.map((point) => point.price);
  const polyline = buildSparklinePath(prices, 760, 220);
  const first = prices[0] ?? 0;
  const last = prices[prices.length - 1] ?? 0;
  const delta = first === 0 ? 0 : ((last - first) / first) * 100;

  return (
    <div className="chart-wrap">
      <div className="chart-meta-row">
        <span>{history.exchange}</span>
        <strong className={delta >= 0 ? 'delta up' : 'delta down'}>{formatPercent(delta)}</strong>
      </div>
      <svg viewBox="0 0 760 220" role="img" aria-label={`${history.symbol} intraday price trend`}>
        <polyline className="chart-line" points={polyline} fill="none" strokeWidth="3" />
      </svg>
      <div className="chart-axis">
        <span>
          {new Date(history.points[0]?.timestamp ?? '').toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
        <strong>Last {formatCurrency(last, history.currency)}</strong>
        <span>
          {new Date(history.points[history.points.length - 1]?.timestamp ?? '').toLocaleTimeString(
            [],
            {
              hour: '2-digit',
              minute: '2-digit'
            }
          )}
        </span>
      </div>
    </div>
  );
}

export function App() {
  const [token, setToken] = useState<string | null>(() => readStorage(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(Boolean(readStorage(TOKEN_KEY)));

  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authName, setAuthName] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  const [watchlist, setWatchlist] = useState<string[]>(() => parseWatchlistFromStorage());
  const [newTicker, setNewTicker] = useState('');

  const [marketSnapshot, setMarketSnapshot] = useState<MarketSnapshot | null>(null);
  const [indexSnapshot, setIndexSnapshot] = useState<MarketSnapshot | null>(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const [selectedSymbol, setSelectedSymbol] = useState<string>(watchlist[0] ?? 'AAPL');
  const [historyRange, setHistoryRange] = useState<(typeof HISTORY_RANGES)[number]>('1d');
  const [history, setHistory] = useState<MarketHistory | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [queryMode, setQueryMode] = useState<QueryMode>('guided');
  const [queryInput, setQueryInput] = useState('');
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [researchResult, setResearchResult] = useState<QueryRecord | null>(null);
  const [researchSessionId, setResearchSessionId] = useState<string | null>(null);

  useEffect(() => {
    writeStorage(TOKEN_KEY, token);
  }, [token]);

  useEffect(() => {
    if (watchlist.length === 0) {
      setWatchlist(DEFAULT_WATCHLIST);
      return;
    }

    writeStorage(WATCHLIST_KEY, JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    if (!watchlist.includes(selectedSymbol)) {
      setSelectedSymbol(watchlist[0] ?? 'AAPL');
    }
  }, [selectedSymbol, watchlist]);

  useEffect(() => {
    if (!token) {
      setAuthChecking(false);
      setUser(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setAuthChecking(true);
      try {
        const me = await apiRequest<User>('/api/auth/me', { token });
        if (cancelled) {
          return;
        }
        setUser(me);
      } catch {
        if (cancelled) {
          return;
        }
        setToken(null);
        setUser(null);
      } finally {
        if (!cancelled) {
          setAuthChecking(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const watchlistParam = useMemo(() => watchlist.join(','), [watchlist]);

  const fetchSnapshots = useCallback(
    async (showLoader: boolean) => {
      if (!token) {
        return;
      }

      if (showLoader) {
        setSnapshotBusy(true);
      }

      try {
        const [watchlistData, indexData] = await Promise.all([
          apiRequest<MarketSnapshot>(
            `/api/market/realtime?symbols=${encodeURIComponent(watchlistParam)}`,
            {
              token
            }
          ),
          apiRequest<MarketSnapshot>(
            `/api/market/realtime?symbols=${encodeURIComponent(INDEX_SYMBOLS.join(','))}`,
            {
              token
            }
          )
        ]);

        setMarketSnapshot(watchlistData);
        setIndexSnapshot(indexData);
        setSnapshotError(null);
      } catch (error) {
        setSnapshotError(parseApiError(error));
      } finally {
        if (showLoader) {
          setSnapshotBusy(false);
        }
      }
    },
    [token, watchlistParam]
  );

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    void fetchSnapshots(true);
    const timer = setInterval(() => {
      void fetchSnapshots(false);
    }, 20_000);

    return () => {
      clearInterval(timer);
    };
  }, [token, user, fetchSnapshots]);

  const fetchHistory = useCallback(async () => {
    if (!token || !selectedSymbol) {
      return;
    }

    setHistoryBusy(true);
    try {
      const data = await apiRequest<MarketHistory>(
        `/api/market/history/${encodeURIComponent(selectedSymbol)}?range=${encodeURIComponent(historyRange)}&interval=5m`,
        { token }
      );
      setHistory(data);
      setHistoryError(null);
    } catch (error) {
      setHistory(null);
      setHistoryError(parseApiError(error));
    } finally {
      setHistoryBusy(false);
    }
  }, [token, selectedSymbol, historyRange]);

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    void fetchHistory();
  }, [token, user, fetchHistory]);

  const handleAuthSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setAuthBusy(true);
      setAuthError(null);

      try {
        const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
        const payload =
          authMode === 'login'
            ? { email: authEmail.trim(), password: authPassword }
            : { email: authEmail.trim(), name: authName.trim(), password: authPassword };

        const result = await apiRequest<AuthResponse>(endpoint, {
          method: 'POST',
          body: payload
        });

        setToken(result.token);
        setUser(result.user);
        setResearchSessionId(null);
      } catch (error) {
        setAuthError(parseApiError(error));
      } finally {
        setAuthBusy(false);
      }
    },
    [authEmail, authMode, authName, authPassword]
  );

  const handleLogout = useCallback(() => {
    setToken(null);
    setUser(null);
    setMarketSnapshot(null);
    setIndexSnapshot(null);
    setHistory(null);
    setResearchResult(null);
    setResearchSessionId(null);
    setSnapshotError(null);
    setHistoryError(null);
    setResearchError(null);
  }, []);

  const handleAddTicker = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const next = normalizeWatchlist([...watchlist, newTicker]);
      if (next.length === 0 || next.join(',') === watchlist.join(',')) {
        setNewTicker('');
        return;
      }

      setWatchlist(next);
      setSelectedSymbol(next[next.length - 1] ?? selectedSymbol);
      setNewTicker('');
    },
    [newTicker, selectedSymbol, watchlist]
  );

  const handleRemoveTicker = useCallback(
    (symbol: string) => {
      if (watchlist.length <= 1) {
        return;
      }

      const next = watchlist.filter((item) => item !== symbol);
      setWatchlist(next);
      if (selectedSymbol === symbol) {
        setSelectedSymbol(next[0] ?? 'AAPL');
      }
    },
    [selectedSymbol, watchlist]
  );

  const ensureResearchSession = useCallback(async (): Promise<string> => {
    if (!token) {
      throw new Error('Authentication required');
    }

    if (researchSessionId) {
      return researchSessionId;
    }

    const session = await apiRequest<Session>('/api/research/sessions', {
      method: 'POST',
      token,
      body: {
        title: `${selectedSymbol} Research Workspace`,
        description: 'Created from FinMind live dashboard'
      }
    });

    setResearchSessionId(session.id);
    return session.id;
  }, [token, researchSessionId, selectedSymbol]);

  const handleRunResearch = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!token || !queryInput.trim()) {
        return;
      }

      setResearchBusy(true);
      setResearchError(null);

      try {
        const sessionId = await ensureResearchSession();
        const result = await apiRequest<QueryRecord>('/api/research/execute', {
          method: 'POST',
          token,
          body: {
            sessionId,
            query: queryInput.trim(),
            mode: queryMode,
            verbosity: queryMode === 'guided' ? 'short' : 'standard'
          }
        });

        setResearchResult(result);
      } catch (error) {
        setResearchError(parseApiError(error));
      } finally {
        setResearchBusy(false);
      }
    },
    [ensureResearchSession, queryInput, queryMode, token]
  );

  const quickPrompts = useMemo(
    () => [
      `Give me a short thesis for ${selectedSymbol} over the next 2 weeks.`,
      `What are the top catalysts and risks for ${selectedSymbol} this quarter?`,
      `Build a bullish and bearish scenario tree for ${selectedSymbol}.`
    ],
    [selectedSymbol]
  );

  const selectedQuote = useMemo(
    () => pickQuote(marketSnapshot, selectedSymbol),
    [marketSnapshot, selectedSymbol]
  );

  const indexQuotes = useMemo(() => {
    if (!indexSnapshot) {
      return [];
    }

    return INDEX_SYMBOLS.map((symbol) => pickQuote(indexSnapshot, symbol)).filter(
      (item): item is MarketQuote => Boolean(item)
    );
  }, [indexSnapshot]);

  const symbolErrors = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of marketSnapshot?.errors ?? []) {
      map.set(item.symbol, item.message);
    }
    return map;
  }, [marketSnapshot?.errors]);

  if (authChecking) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="eyebrow">FinMind</p>
          <h1>Checking your session...</h1>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="brand-lockup">
            <img src={finmindLogo} alt="FinMind" />
            <div>
              <p className="eyebrow">FinMind</p>
              <h1>Realtime Research Workspace</h1>
            </div>
          </div>
          <p className="subtle">Live market data + AI analysis in one focused workflow.</p>

          <div className="mode-switch" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={authMode === 'login' ? 'active' : ''}
              onClick={() => setAuthMode('login')}
            >
              Login
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'active' : ''}
              onClick={() => setAuthMode('register')}
            >
              Register
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === 'register' ? (
              <label>
                Name
                <input
                  value={authName}
                  onChange={(event) => setAuthName(event.target.value)}
                  placeholder="Jane Analyst"
                  required
                />
              </label>
            ) : null}

            <label>
              Email
              <input
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="you@company.com"
                type="email"
                required
              />
            </label>

            <label>
              Password
              <input
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                placeholder="At least 8 characters"
                type="password"
                minLength={8}
                required
              />
            </label>

            {authError ? <p className="error-text">{authError}</p> : null}

            <button className="primary-btn" type="submit" disabled={authBusy}>
              {authBusy ? 'Please wait...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="topbar-brand">
          <img src={finmindLogo} alt="FinMind" />
          <div>
            <p className="eyebrow">FinMind Command Desk</p>
            <h2>Live market pulse for {user.name}</h2>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="updated-chip">Last sync {formatAsOf(marketSnapshot?.asOf ?? null)}</span>
          <button className="ghost-btn" type="button" onClick={() => void fetchSnapshots(true)}>
            Refresh
          </button>
          <button className="ghost-btn" type="button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="indices-row">
        {indexQuotes.map((quote) => (
          <article key={quote.symbol} className="index-tile">
            <p>{quote.symbol}</p>
            <strong>{formatCurrency(quote.price, quote.currency)}</strong>
            <span className={quote.changePercent >= 0 ? 'up' : 'down'}>
              {formatPercent(quote.changePercent)}
            </span>
          </article>
        ))}
      </div>

      {snapshotError ? <p className="error-banner">Live feed issue: {snapshotError}</p> : null}

      <main className="main-grid">
        <aside className="panel watchlist-panel">
          <div className="panel-header">
            <h3>Watchlist</h3>
            <span>{watchlist.length} symbols</span>
          </div>

          <form className="ticker-form" onSubmit={handleAddTicker}>
            <input
              value={newTicker}
              onChange={(event) => setNewTicker(event.target.value)}
              placeholder="Add ticker (e.g. TSLA)"
              aria-label="Add ticker"
            />
            <button className="primary-btn" type="submit">
              Add
            </button>
          </form>

          <div className="quote-list">
            {watchlist.map((symbol) => {
              const quote = pickQuote(marketSnapshot, symbol);
              const active = selectedSymbol === symbol;
              const symbolError = symbolErrors.get(symbol);

              return (
                <button
                  key={symbol}
                  type="button"
                  className={`quote-card ${active ? 'active' : ''}`}
                  onClick={() => setSelectedSymbol(symbol)}
                >
                  <div className="quote-head">
                    <strong>{symbol}</strong>
                    <div className="quote-actions">
                      <span className={quote && quote.changePercent >= 0 ? 'up' : 'down'}>
                        {quote ? formatPercent(quote.changePercent) : '...'}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        className="remove-ticker"
                        aria-label={`Remove ${symbol}`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleRemoveTicker(symbol);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') {
                            return;
                          }
                          event.preventDefault();
                          event.stopPropagation();
                          handleRemoveTicker(symbol);
                        }}
                      >
                        ×
                      </span>
                    </div>
                  </div>
                  <p>{quote ? formatCurrency(quote.price, quote.currency) : 'Loading...'}</p>
                  {symbolError ? <p className="symbol-error">{symbolError}</p> : null}
                </button>
              );
            })}
          </div>

          <p className="muted-note">Quotes auto-refresh every 20 seconds.</p>
        </aside>

        <section className="panel focus-panel">
          <div className="panel-header">
            <div>
              <h3>{selectedSymbol}</h3>
              <p className="subtle">Intraday trend and key levels</p>
            </div>
            <div className="range-switch" role="tablist" aria-label="Chart range">
              {HISTORY_RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  className={historyRange === range ? 'active' : ''}
                  onClick={() => setHistoryRange(range)}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          {historyBusy ? (
            <p className="placeholder">Loading chart...</p>
          ) : (
            <ChartCard history={history} />
          )}
          {historyError ? <p className="error-text">{historyError}</p> : null}

          <div className="metric-grid">
            <article>
              <span>Open</span>
              <strong>
                {selectedQuote && selectedQuote.open !== null
                  ? formatCurrency(selectedQuote.open, selectedQuote.currency)
                  : 'n/a'}
              </strong>
            </article>
            <article>
              <span>Day Range</span>
              <strong>
                {selectedQuote && selectedQuote.dayLow !== null && selectedQuote.dayHigh !== null
                  ? `${formatCurrency(selectedQuote.dayLow, selectedQuote.currency)} - ${formatCurrency(selectedQuote.dayHigh, selectedQuote.currency)}`
                  : 'n/a'}
              </strong>
            </article>
            <article>
              <span>Volume</span>
              <strong>{selectedQuote ? formatCompactNumber(selectedQuote.volume) : 'n/a'}</strong>
            </article>
            <article>
              <span>Market Cap</span>
              <strong>
                {selectedQuote ? formatCompactNumber(selectedQuote.marketCap) : 'n/a'}
              </strong>
            </article>
          </div>
        </section>

        <section className="panel research-panel">
          <div className="panel-header">
            <div>
              <h3>Research Assistant</h3>
              <p className="subtle">Run guided or deep analysis against your current focus.</p>
            </div>
            <div className="mode-switch compact" role="tablist" aria-label="Research mode">
              <button
                type="button"
                className={queryMode === 'guided' ? 'active' : ''}
                onClick={() => setQueryMode('guided')}
              >
                Guided
              </button>
              <button
                type="button"
                className={queryMode === 'advanced' ? 'active' : ''}
                onClick={() => setQueryMode('advanced')}
              >
                Advanced
              </button>
            </div>
          </div>

          <div className="prompt-chips">
            {quickPrompts.map((prompt) => (
              <button key={prompt} type="button" onClick={() => setQueryInput(prompt)}>
                {prompt}
              </button>
            ))}
          </div>

          <form className="research-form" onSubmit={handleRunResearch}>
            <textarea
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder={`Ask about ${selectedSymbol}: thesis, catalysts, risks, execution plan...`}
              rows={6}
            />
            <button
              className="primary-btn"
              type="submit"
              disabled={researchBusy || !queryInput.trim()}
            >
              {researchBusy ? 'Running analysis...' : 'Run Analysis'}
            </button>
          </form>

          {researchError ? <p className="error-text">{researchError}</p> : null}

          {researchResult?.response ? (
            <article className="response-card">
              <header>
                <strong>Latest Response</strong>
                <span>{new Date(researchResult.createdAt).toLocaleString()}</span>
              </header>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{researchResult.response}</ReactMarkdown>

              {researchResult.artifacts?.sources && researchResult.artifacts.sources.length > 0 ? (
                <div className="sources">
                  <h4>Sources</h4>
                  <ul>
                    {researchResult.artifacts.sources.slice(0, 6).map((source) => (
                      <li key={source}>
                        <a href={source} target="_blank" rel="noreferrer">
                          {source}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          ) : (
            <p className="placeholder">
              Run your first query to generate a structured investment brief.
            </p>
          )}
        </section>
      </main>

      {snapshotBusy ? <p className="sync-note">Refreshing market feed...</p> : null}
    </div>
  );
}
