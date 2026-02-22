import type {
  BudgetSettings,
  QueryRecord,
  Session,
  UserRole,
  User,
  Watchlist
} from '@finmind/shared';

export type StoredUser = User & {
  passwordHash: string;
  updatedAt: string;
};

export type CreateUserInput = {
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
};

export type CreateSessionInput = {
  userId: string;
  title: string;
  description: string | null;
};

export type CreateQueryInput = {
  userId: string;
  sessionId: string;
  question: string;
  provider: string;
  model: string;
};

export type CreateWatchlistInput = {
  userId: string;
  name: string;
};

export type UpsertWatchlistItemInput = {
  watchlistId: string;
  ticker: string;
  note: string | null;
  targetPrice: number | null;
};

export type UpdateQueryInput = Partial<
  Pick<QueryRecord, 'status' | 'response' | 'error' | 'provider' | 'model' | 'artifacts' | 'usage'>
>;

export interface Repository {
  createUser(input: CreateUserInput): StoredUser;
  findUserByEmail(email: string): StoredUser | null;
  findUserById(userId: string): StoredUser | null;
  listUsers(): StoredUser[];
  updateUserRole(userId: string, role: UserRole): StoredUser | null;

  createSession(input: CreateSessionInput): Session;
  getSessionById(sessionId: string): Session | null;
  getSessionsByUserId(userId: string): Session[];
  listSessions(): Session[];

  createQuery(input: CreateQueryInput): QueryRecord;
  updateQuery(queryId: string, patch: UpdateQueryInput): QueryRecord | null;
  getQueriesBySessionId(sessionId: string): QueryRecord[];
  getQueriesByUserId(userId: string): QueryRecord[];
  listQueries(): QueryRecord[];

  getBudgetSettings(userId: string): BudgetSettings;
  setBudgetSettings(userId: string, patch: Partial<BudgetSettings>): BudgetSettings;
  getSessionSpend(userId: string, sessionId: string): number;
  getDailySpend(userId: string, isoDate: string): number;
  getMonthlySpend(userId: string, isoMonth: string): number;

  createWatchlist(input: CreateWatchlistInput): Watchlist;
  getWatchlistsByUserId(userId: string): Watchlist[];
  getWatchlistById(watchlistId: string): Watchlist | null;
  upsertWatchlistItem(input: UpsertWatchlistItemInput): Watchlist | null;
  removeWatchlistItem(watchlistId: string, ticker: string): Watchlist | null;
  deleteWatchlist(watchlistId: string): boolean;
}
