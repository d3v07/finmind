import type { UserRole } from '@finmind/shared';
import { AppError } from '../errors.js';
import type { Repository } from '../repositories/types.js';

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toIsoMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function clipText(input: string, max = 140): string {
  const compact = input.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 3)}...`;
}

export class AdminService {
  constructor(private readonly repository: Repository) {}

  getOverview() {
    const users = this.repository.listUsers();
    const sessions = this.repository.listSessions();
    const queries = this.repository.listQueries();
    const today = toIsoDate(new Date());
    const month = toIsoMonth(new Date());

    const queriesToday = queries.filter((query) => query.createdAt.slice(0, 10) === today).length;
    const monthlyCostEstimate = queries
      .filter((query) => query.createdAt.slice(0, 7) === month)
      .reduce((sum, query) => sum + (query.usage?.estimatedCost ?? 0), 0);

    return {
      usersTotal: users.length,
      adminCount: users.filter((user) => user.role === 'admin').length,
      sessionsTotal: sessions.length,
      queriesTotal: queries.length,
      queriesToday,
      completedQueries: queries.filter((query) => query.status === 'completed').length,
      failedQueries: queries.filter((query) => query.status === 'failed').length,
      monthlyCostEstimate: Number(monthlyCostEstimate.toFixed(4))
    };
  }

  listUsers() {
    const users = this.repository.listUsers();
    const sessions = this.repository.listSessions();
    const queries = this.repository.listQueries();
    const month = toIsoMonth(new Date());

    return users.map((user) => {
      const userSessions = sessions.filter((session) => session.userId === user.id);
      const userQueries = queries.filter((query) => query.userId === user.id);
      const monthlySpend = userQueries
        .filter((query) => query.createdAt.slice(0, 7) === month)
        .reduce((sum, query) => sum + (query.usage?.estimatedCost ?? 0), 0);
      const latest = userQueries[0]?.updatedAt ?? user.updatedAt;

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        sessions: userSessions.length,
        queries: userQueries.length,
        monthlySpend: Number(monthlySpend.toFixed(4)),
        lastActiveAt: latest
      };
    });
  }

  listSessions(limit = 200) {
    const users = this.repository.listUsers();
    const userMap = new Map(users.map((user) => [user.id, user]));
    const queries = this.repository.listQueries();
    const queryCountBySession = new Map<string, number>();

    for (const query of queries) {
      queryCountBySession.set(query.sessionId, (queryCountBySession.get(query.sessionId) ?? 0) + 1);
    }

    return this.repository
      .listSessions()
      .slice(0, Math.max(1, Math.min(limit, 500)))
      .map((session) => ({
        id: session.id,
        title: session.title,
        description: session.description,
        userId: session.userId,
        userEmail: userMap.get(session.userId)?.email ?? 'unknown',
        userName: userMap.get(session.userId)?.name ?? 'unknown',
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        queryCount: queryCountBySession.get(session.id) ?? 0
      }));
  }

  listQueries(limit = 300) {
    const users = this.repository.listUsers();
    const sessions = this.repository.listSessions();
    const userMap = new Map(users.map((user) => [user.id, user]));
    const sessionMap = new Map(sessions.map((session) => [session.id, session]));

    return this.repository
      .listQueries()
      .slice(0, Math.max(1, Math.min(limit, 1000)))
      .map((query) => ({
        id: query.id,
        userId: query.userId,
        userEmail: userMap.get(query.userId)?.email ?? 'unknown',
        sessionId: query.sessionId,
        sessionTitle: sessionMap.get(query.sessionId)?.title ?? 'unknown',
        status: query.status,
        provider: query.provider,
        model: query.model,
        estimatedCost: Number((query.usage?.estimatedCost ?? 0).toFixed(4)),
        createdAt: query.createdAt,
        updatedAt: query.updatedAt,
        questionPreview: clipText(query.question)
      }));
  }

  updateUserRole(actorUserId: string, targetUserId: string, role: UserRole) {
    const actor = this.repository.findUserById(actorUserId);
    if (!actor || actor.role !== 'admin') {
      throw new AppError('Admin privileges required', 403, 'FORBIDDEN');
    }

    const target = this.repository.findUserById(targetUserId);
    if (!target) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (target.role === 'admin' && role === 'user') {
      const adminCount = this.repository.listUsers().filter((user) => user.role === 'admin').length;
      if (adminCount <= 1) {
        throw new AppError('At least one admin account is required', 400, 'ADMIN_REQUIRED');
      }
    }

    const updated = this.repository.updateUserRole(targetUserId, role);
    if (!updated) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      updatedAt: updated.updatedAt
    };
  }
}
