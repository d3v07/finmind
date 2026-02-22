import type {
  BudgetSettings,
  BudgetSnapshot,
  CreateSessionInput,
  CreateWatchlistInput,
  ExecuteQueryInput,
  QueryRecord,
  Session,
  UpsertWatchlistItemInput,
  Watchlist
} from '@finmind/shared';
import { AppError } from '../errors.js';
import type { Repository } from '../repositories/types.js';
import type { DexterAdapter } from '../dexter/adapter.js';
import { enrichArtifactsWithMarketData } from './market-artifacts.js';
import { assertBudgetAllowance, getBudgetSnapshot, updateBudgetSettings } from '../system/budget.js';

export class ResearchService {
  constructor(
    private readonly repository: Repository,
    private readonly dexterAdapter: DexterAdapter
  ) {}

  createSession(userId: string, input: CreateSessionInput): Session {
    return this.repository.createSession({
      userId,
      title: input.title,
      description: input.description ?? null
    });
  }

  getSessions(userId: string): Session[] {
    return this.repository.getSessionsByUserId(userId);
  }

  getQueries(userId: string, sessionId: string): QueryRecord[] {
    this.assertSessionOwner(sessionId, userId);
    return this.repository.getQueriesBySessionId(sessionId);
  }

  getWatchlists(userId: string): Watchlist[] {
    return this.repository.getWatchlistsByUserId(userId);
  }

  createWatchlist(userId: string, input: CreateWatchlistInput): Watchlist {
    return this.repository.createWatchlist({
      userId,
      name: input.name
    });
  }

  upsertWatchlistItem(userId: string, watchlistId: string, input: UpsertWatchlistItemInput): Watchlist {
    const watchlist = this.assertWatchlistOwner(watchlistId, userId);

    const updated = this.repository.upsertWatchlistItem({
      watchlistId: watchlist.id,
      ticker: input.ticker,
      note: input.note?.trim() ?? null,
      targetPrice: input.targetPrice ?? null
    });

    if (!updated) {
      throw new AppError('Watchlist not found', 404, 'WATCHLIST_NOT_FOUND');
    }

    return updated;
  }

  removeWatchlistItem(userId: string, watchlistId: string, ticker: string): Watchlist {
    const watchlist = this.assertWatchlistOwner(watchlistId, userId);
    const updated = this.repository.removeWatchlistItem(watchlist.id, ticker);

    if (!updated) {
      throw new AppError('Watchlist not found', 404, 'WATCHLIST_NOT_FOUND');
    }

    return updated;
  }

  deleteWatchlist(userId: string, watchlistId: string): void {
    const watchlist = this.assertWatchlistOwner(watchlistId, userId);
    const deleted = this.repository.deleteWatchlist(watchlist.id);
    if (!deleted) {
      throw new AppError('Watchlist not found', 404, 'WATCHLIST_NOT_FOUND');
    }
  }

  getBudgetSnapshot(userId: string, sessionId?: string): BudgetSnapshot {
    return getBudgetSnapshot(this.repository, userId, sessionId);
  }

  updateBudgetSettings(userId: string, patch: Partial<BudgetSettings>): BudgetSettings {
    return updateBudgetSettings(this.repository, userId, patch);
  }

  async executeQuery(userId: string, input: ExecuteQueryInput): Promise<QueryRecord> {
    const session = this.assertSessionOwner(input.sessionId, userId);
    const history = this.repository.getQueriesBySessionId(input.sessionId);
    const mode = input.mode ?? 'advanced';
    const verbosity = input.verbosity ?? (mode === 'guided' ? 'short' : 'deep');

    const budgetCheck = assertBudgetAllowance(
      this.repository,
      userId,
      input.sessionId,
      input.query,
      mode,
      verbosity
    );

    const timeline: Array<{
      step: string;
      timestamp: string;
      durationMs: number | null;
      detail?: string;
    }> = [
      {
        step: 'budget_check',
        timestamp: new Date().toISOString(),
        durationMs: null,
        detail: `estimated_cost=$${budgetCheck.estimatedCost.toFixed(4)}`
      }
    ];

    const pending = this.repository.createQuery({
      userId,
      sessionId: input.sessionId,
      question: input.query,
      provider: 'pending',
      model: 'pending'
    });

    try {
      const adapterStarted = Date.now();
      const result = await this.dexterAdapter.run({
        prompt: input.query,
        history,
        session,
        mode,
        verbosity
      });
      timeline.push({
        step: 'agent_completed',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - adapterStarted,
        detail: `${result.provider}/${result.model}`
      });

      const marketStarted = Date.now();
      const artifacts = await enrichArtifactsWithMarketData(input.query, result.artifacts, {
        profile: mode === 'guided' ? 'light' : 'full',
        response: result.answer,
        sessionId: session.id,
        history: history.map((item) => ({
          createdAt: item.createdAt,
          question: item.question,
          response: item.response
        }))
      });
      timeline.push({
        step: 'market_artifacts_enriched',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - marketStarted
      });

      const usage =
        result.usage ??
        ({
          tokenCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: budgetCheck.estimatedCost,
          costBreakdown: {
            openrouter: budgetCheck.estimatedCost,
            financial: 0,
            exa: 0
          }
        } as const);

      const nextArtifacts = {
        ...(artifacts ?? {}),
        timeline: [...timeline]
      };

      const completed = this.repository.updateQuery(pending.id, {
        status: 'completed',
        response: result.answer,
        error: null,
        provider: result.provider,
        model: result.model,
        usage,
        artifacts: nextArtifacts
      });

      if (!completed) {
        throw new AppError('Failed to persist query response', 500, 'QUERY_PERSIST_FAILED');
      }

      return completed;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown execution error';

      const failed = this.repository.updateQuery(pending.id, {
        status: 'failed',
        error: message,
        response: null,
        provider: 'error',
        model: 'error',
        usage: {
          tokenCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: 0,
          costBreakdown: {
            openrouter: 0,
            financial: 0,
            exa: 0
          }
        },
        artifacts: {
          timeline: [...timeline, { step: 'execution_failed', timestamp: new Date().toISOString(), durationMs: null, detail: message }]
        }
      });

      if (!failed) {
        throw new AppError(message, 500, 'QUERY_EXECUTION_FAILED');
      }

      throw new AppError(message, 500, 'QUERY_EXECUTION_FAILED');
    }
  }

  private assertSessionOwner(sessionId: string, userId: string): Session {
    const session = this.repository.getSessionById(sessionId);

    if (!session) {
      throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    if (session.userId !== userId) {
      throw new AppError('You do not have access to this session', 403, 'FORBIDDEN');
    }

    return session;
  }

  private assertWatchlistOwner(watchlistId: string, userId: string): Watchlist {
    const watchlist = this.repository.getWatchlistById(watchlistId);

    if (!watchlist) {
      throw new AppError('Watchlist not found', 404, 'WATCHLIST_NOT_FOUND');
    }

    if (watchlist.userId !== userId) {
      throw new AppError('You do not have access to this watchlist', 403, 'FORBIDDEN');
    }

    return watchlist;
  }
}
