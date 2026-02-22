import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  BudgetSettings,
  QueryRecord,
  QueryStatus,
  Session,
  UserRole,
  Watchlist
} from '@finmind/shared';
import type {
  CreateWatchlistInput,
  CreateQueryInput,
  CreateSessionInput,
  CreateUserInput,
  Repository,
  StoredUser,
  UpsertWatchlistItemInput,
  UpdateQueryInput
} from './types.js';

type PersistedState = {
  users: StoredUser[];
  sessions: Session[];
  queries: QueryRecord[];
  watchlists: Watchlist[];
  budgetSettings: Array<{
    userId: string;
    dailyBudgetCap: number;
    monthlyBudgetCap: number;
    perSessionCap: number;
    perQueryCap: number;
  }>;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeRole(role: unknown): UserRole {
  return role === 'admin' ? 'admin' : 'user';
}

function readAdminEmailsFromEnv(): Set<string> {
  const raw = process.env.FINMIND_ADMIN_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0)
  );
}

function sortByDateDesc<T extends { updatedAt: string }>(items: T[]) {
  return [...items].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

const DEFAULT_BUDGET_SETTINGS: BudgetSettings = {
  dailyBudgetCap: 50,
  monthlyBudgetCap: 500,
  perSessionCap: 100,
  perQueryCap: 10
};

function toIsoDate(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

function toIsoMonth(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 7);
}

function queryCost(query: QueryRecord): number {
  return query.usage?.estimatedCost ?? 0;
}

export class FileRepository implements Repository {
  private readonly filePath: string;
  private state: PersistedState;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.state = this.loadState();
    this.ensureAdminBootstrap();
  }

  createUser(input: CreateUserInput): StoredUser {
    const createdAt = nowIso();

    const user: StoredUser = {
      id: randomUUID(),
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      role: input.role,
      passwordHash: input.passwordHash,
      createdAt,
      updatedAt: createdAt
    };

    this.state.users.push(user);
    this.persist();

    return user;
  }

  findUserByEmail(email: string): StoredUser | null {
    const normalized = email.trim().toLowerCase();
    return this.state.users.find((user) => user.email === normalized) ?? null;
  }

  findUserById(userId: string): StoredUser | null {
    return this.state.users.find((user) => user.id === userId) ?? null;
  }

  listUsers(): StoredUser[] {
    return sortByDateDesc(this.state.users);
  }

  updateUserRole(userId: string, role: UserRole): StoredUser | null {
    const target = this.state.users.find((user) => user.id === userId);
    if (!target) {
      return null;
    }

    target.role = role;
    target.updatedAt = nowIso();
    this.persist();
    return target;
  }

  createSession(input: CreateSessionInput): Session {
    const createdAt = nowIso();

    const session: Session = {
      id: randomUUID(),
      userId: input.userId,
      title: input.title.trim(),
      description: input.description,
      createdAt,
      updatedAt: createdAt
    };

    this.state.sessions.push(session);
    this.persist();

    return session;
  }

  getSessionById(sessionId: string): Session | null {
    return this.state.sessions.find((session) => session.id === sessionId) ?? null;
  }

  getSessionsByUserId(userId: string): Session[] {
    const userSessions = this.state.sessions.filter((session) => session.userId === userId);
    return sortByDateDesc(userSessions);
  }

  listSessions(): Session[] {
    return sortByDateDesc(this.state.sessions);
  }

  createQuery(input: CreateQueryInput): QueryRecord {
    const createdAt = nowIso();

    const query: QueryRecord = {
      id: randomUUID(),
      userId: input.userId,
      sessionId: input.sessionId,
      question: input.question,
      response: null,
      status: 'pending',
      error: null,
      provider: input.provider,
      model: input.model,
      createdAt,
      updatedAt: createdAt
    };

    this.state.queries.push(query);
    this.touchSession(input.sessionId);
    this.persist();

    return query;
  }

  updateQuery(queryId: string, patch: UpdateQueryInput): QueryRecord | null {
    const target = this.state.queries.find((query) => query.id === queryId);
    if (!target) {
      return null;
    }

    if (patch.status) {
      target.status = patch.status as QueryStatus;
    }
    if (patch.response !== undefined) {
      target.response = patch.response;
    }
    if (patch.error !== undefined) {
      target.error = patch.error;
    }
    if (patch.provider) {
      target.provider = patch.provider;
    }
    if (patch.model) {
      target.model = patch.model;
    }
    if (patch.artifacts !== undefined) {
      target.artifacts = patch.artifacts;
    }
    if (patch.usage !== undefined) {
      target.usage = patch.usage;
    }

    target.updatedAt = nowIso();
    this.touchSession(target.sessionId);
    this.persist();

    return target;
  }

  getQueriesBySessionId(sessionId: string): QueryRecord[] {
    const items = this.state.queries.filter((query) => query.sessionId === sessionId);
    return sortByDateDesc(items).reverse();
  }

  getQueriesByUserId(userId: string): QueryRecord[] {
    const items = this.state.queries.filter((query) => query.userId === userId);
    return sortByDateDesc(items).reverse();
  }

  listQueries(): QueryRecord[] {
    return sortByDateDesc(this.state.queries);
  }

  getBudgetSettings(userId: string): BudgetSettings {
    const existing = this.state.budgetSettings.find((item) => item.userId === userId);
    if (!existing) {
      return { ...DEFAULT_BUDGET_SETTINGS };
    }

    return {
      dailyBudgetCap: existing.dailyBudgetCap,
      monthlyBudgetCap: existing.monthlyBudgetCap,
      perSessionCap: existing.perSessionCap,
      perQueryCap: existing.perQueryCap
    };
  }

  setBudgetSettings(userId: string, patch: Partial<BudgetSettings>): BudgetSettings {
    const existingIndex = this.state.budgetSettings.findIndex((item) => item.userId === userId);
    const base = existingIndex >= 0 ? this.state.budgetSettings[existingIndex] : { userId, ...DEFAULT_BUDGET_SETTINGS };

    const next = {
      userId,
      dailyBudgetCap: patch.dailyBudgetCap ?? base.dailyBudgetCap,
      monthlyBudgetCap: patch.monthlyBudgetCap ?? base.monthlyBudgetCap,
      perSessionCap: patch.perSessionCap ?? base.perSessionCap,
      perQueryCap: patch.perQueryCap ?? base.perQueryCap
    };

    if (existingIndex >= 0) {
      this.state.budgetSettings[existingIndex] = next;
    } else {
      this.state.budgetSettings.push(next);
    }

    this.persist();
    return {
      dailyBudgetCap: next.dailyBudgetCap,
      monthlyBudgetCap: next.monthlyBudgetCap,
      perSessionCap: next.perSessionCap,
      perQueryCap: next.perQueryCap
    };
  }

  getSessionSpend(userId: string, sessionId: string): number {
    return this.state.queries
      .filter((query) => query.userId === userId && query.sessionId === sessionId)
      .reduce((sum, query) => sum + queryCost(query), 0);
  }

  getDailySpend(userId: string, isoDate: string): number {
    return this.state.queries
      .filter((query) => query.userId === userId && toIsoDate(query.updatedAt) === isoDate)
      .reduce((sum, query) => sum + queryCost(query), 0);
  }

  getMonthlySpend(userId: string, isoMonth: string): number {
    return this.state.queries
      .filter((query) => query.userId === userId && toIsoMonth(query.updatedAt) === isoMonth)
      .reduce((sum, query) => sum + queryCost(query), 0);
  }

  createWatchlist(input: CreateWatchlistInput): Watchlist {
    const createdAt = nowIso();
    const watchlist: Watchlist = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name.trim(),
      items: [],
      createdAt,
      updatedAt: createdAt
    };

    this.state.watchlists.push(watchlist);
    this.persist();
    return watchlist;
  }

  getWatchlistsByUserId(userId: string): Watchlist[] {
    return sortByDateDesc(this.state.watchlists.filter((item) => item.userId === userId));
  }

  getWatchlistById(watchlistId: string): Watchlist | null {
    return this.state.watchlists.find((item) => item.id === watchlistId) ?? null;
  }

  upsertWatchlistItem(input: UpsertWatchlistItemInput): Watchlist | null {
    const watchlist = this.getWatchlistById(input.watchlistId);
    if (!watchlist) {
      return null;
    }

    const ticker = input.ticker.trim().toUpperCase();
    const existing = watchlist.items.find((item) => item.ticker === ticker);
    const updatedAt = nowIso();

    if (existing) {
      existing.note = input.note;
      existing.targetPrice = input.targetPrice;
      existing.updatedAt = updatedAt;
    } else {
      watchlist.items.push({
        ticker,
        note: input.note,
        targetPrice: input.targetPrice,
        createdAt: updatedAt,
        updatedAt
      });
    }

    watchlist.updatedAt = updatedAt;
    this.persist();
    return watchlist;
  }

  removeWatchlistItem(watchlistId: string, ticker: string): Watchlist | null {
    const watchlist = this.getWatchlistById(watchlistId);
    if (!watchlist) {
      return null;
    }

    const normalizedTicker = ticker.trim().toUpperCase();
    watchlist.items = watchlist.items.filter((item) => item.ticker !== normalizedTicker);
    watchlist.updatedAt = nowIso();
    this.persist();
    return watchlist;
  }

  deleteWatchlist(watchlistId: string): boolean {
    const before = this.state.watchlists.length;
    this.state.watchlists = this.state.watchlists.filter((item) => item.id !== watchlistId);

    if (this.state.watchlists.length === before) {
      return false;
    }

    this.persist();
    return true;
  }

  private touchSession(sessionId: string) {
    const session = this.state.sessions.find((item) => item.id === sessionId);
    if (session) {
      session.updatedAt = nowIso();
    }
  }

  private loadState(): PersistedState {
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedState;

      return {
        users: (parsed.users ?? []).map((user) => ({
          ...user,
          role: normalizeRole((user as { role?: unknown }).role)
        })),
        sessions: parsed.sessions ?? [],
        queries: parsed.queries ?? [],
        watchlists: parsed.watchlists ?? [],
        budgetSettings: parsed.budgetSettings ?? []
      };
    } catch {
      return {
        users: [],
        sessions: [],
        queries: [],
        watchlists: [],
        budgetSettings: []
      };
    }
  }

  private persist() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  private ensureAdminBootstrap() {
    if (this.state.users.length === 0) {
      return;
    }

    const adminEmails = readAdminEmailsFromEnv();
    let changed = false;

    for (const user of this.state.users) {
      const shouldBeAdmin = adminEmails.has(user.email.toLowerCase());
      const nextRole: UserRole = shouldBeAdmin ? 'admin' : normalizeRole(user.role);
      if (user.role !== nextRole) {
        user.role = nextRole;
        user.updatedAt = nowIso();
        changed = true;
      }
    }

    const hasAdmin = this.state.users.some((user) => user.role === 'admin');
    if (!hasAdmin) {
      const oldestUser = [...this.state.users].sort(
        (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
      )[0];
      if (oldestUser && oldestUser.role !== 'admin') {
        oldestUser.role = 'admin';
        oldestUser.updatedAt = nowIso();
        changed = true;
      }
    }

    if (changed) {
      this.persist();
    }
  }
}
