import type { BudgetSettings, BudgetSnapshot } from '@finmind/shared';
import { AppError } from '../errors.js';
import type { Repository } from '../repositories/types.js';
import { estimateQueryCostFromPrompt } from './costs.js';

function isoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function isoMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function getBudgetSnapshot(
  repository: Repository,
  userId: string,
  sessionId?: string
): BudgetSnapshot {
  const settings = repository.getBudgetSettings(userId);
  const now = new Date();
  const daily = repository.getDailySpend(userId, isoDate(now));
  const monthly = repository.getMonthlySpend(userId, isoMonth(now));
  const session = sessionId ? repository.getSessionSpend(userId, sessionId) : null;

  const snapshot: BudgetSnapshot = {
    settings,
    spent: {
      daily: round2(daily),
      monthly: round2(monthly),
      session: session !== null ? round2(session) : null
    },
    remaining: {
      daily: round2(Math.max(0, settings.dailyBudgetCap - daily)),
      monthly: round2(Math.max(0, settings.monthlyBudgetCap - monthly)),
      session: session !== null ? round2(Math.max(0, settings.perSessionCap - session)) : null,
      perQuery: round2(settings.perQueryCap)
    },
    asOf: now.toISOString()
  };

  return snapshot;
}

export function updateBudgetSettings(
  repository: Repository,
  userId: string,
  patch: Partial<BudgetSettings>
): BudgetSettings {
  return repository.setBudgetSettings(userId, patch);
}

export function assertBudgetAllowance(
  repository: Repository,
  userId: string,
  sessionId: string,
  prompt: string,
  mode: 'guided' | 'advanced',
  verbosity: 'short' | 'standard' | 'deep'
): { estimatedCost: number; snapshot: BudgetSnapshot } {
  const snapshot = getBudgetSnapshot(repository, userId, sessionId);
  const estimatedCost = estimateQueryCostFromPrompt(prompt, mode, verbosity);
  const settings = snapshot.settings;

  const violations: string[] = [];
  if (estimatedCost > settings.perQueryCap) {
    violations.push(`per-query cap ($${settings.perQueryCap})`);
  }
  if (snapshot.spent.daily + estimatedCost > settings.dailyBudgetCap) {
    violations.push(`daily cap ($${settings.dailyBudgetCap})`);
  }
  if (snapshot.spent.monthly + estimatedCost > settings.monthlyBudgetCap) {
    violations.push(`monthly cap ($${settings.monthlyBudgetCap})`);
  }
  if ((snapshot.spent.session ?? 0) + estimatedCost > settings.perSessionCap) {
    violations.push(`session cap ($${settings.perSessionCap})`);
  }

  if (violations.length > 0) {
    throw new AppError(
      `Budget limit exceeded: ${violations.join(', ')}. Estimated query cost: $${estimatedCost.toFixed(2)}`,
      402,
      'BUDGET_EXCEEDED'
    );
  }

  return { estimatedCost, snapshot };
}
