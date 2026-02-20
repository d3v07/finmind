import { randomUUID } from 'node:crypto';
import cors from 'cors';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import {
  budgetSettingsSchema,
  createWatchlistInputSchema,
  createSessionInputSchema,
  executeQueryInputSchema,
  loginInputSchema,
  registerInputSchema,
  upsertWatchlistItemInputSchema
} from '@finmind/shared';
import { getBearerToken, verifyAccessToken } from './auth/jwt.js';
import { isAppError } from './errors.js';
import { getHealthStatus } from './health.js';
import { QueryQueue } from './research/query-queue.js';
import { enrichArtifactsWithMarketData } from './research/market-artifacts.js';
import { createAppServices } from './services/index.js';
import { getProviderDiagnostics } from './system/provider-diagnostics.js';
import { getSecretValidation } from './system/secrets-validator.js';
import { appRouter, type AppContext } from './trpc.js';
import {
  buildApiDocsMarkdown,
  buildApiDocsPayload,
  buildOpenApiSpec,
  buildSwaggerUiHtml,
  trpcDocs
} from './docs/api-docs.js';

dotenv.config();
dotenv.config({ path: '../../.env' });

const app = express();
const port = Number(process.env.PORT ?? 3001);
const services = createAppServices();
const queryQueue = new QueryQueue((userId, input) => services.researchService.executeQuery(userId, input));

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const requestId = req.header('x-request-id') ?? randomUUID();
  res.setHeader('x-request-id', requestId);
  res.locals.requestId = requestId;
  const startedAt = Date.now();

  res.on('finish', () => {
    const logEvent = {
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'api',
      requestId,
      method: req.method,
      route: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      message: 'request_completed'
    };

    console.log(JSON.stringify(logEvent));
  });

  next();
});

app.get('/health', (_req, res) => {
  res.json(getHealthStatus());
});

app.get('/ready', (_req, res) => {
  res.json(getHealthStatus());
});

app.get('/', (_req, res) => {
  res.status(200).json({
    service: 'finmind-api',
    status: 'ok',
    health: '/health',
    ready: '/ready',
    docs: '/api/docs',
    docsMarkdown: '/api/docs.md',
    openapi: '/api/openapi.json',
    swagger: '/api/swagger',
    webApp: process.env.FINMIND_WEB_URL ?? 'http://localhost:5173',
    endpoints: {
      auth: '/api/auth/*',
      admin: '/api/admin/*',
      research: '/api/research/*',
      system: '/api/system/*',
      budget: '/api/budget*',
      features: [
        '/api/workflows/presets',
        '/api/views',
        '/api/reports/compose',
        '/api/portfolio/*',
        '/api/alerts*',
        '/api/journal*',
        '/api/workspaces*',
        '/api/comments*',
        '/api/approvals*',
        '/api/share-links*',
        '/api/distribution/*',
        '/api/webhooks*',
        '/api/enterprise/*',
        '/api/compliance/*',
        '/api/weekly-brief*',
        '/api/session-memory/:sessionId'
      ]
    }
  });
});

app.get('/api/docs', (_req, res) => {
  res.status(200).json(buildApiDocsPayload());
});

app.get('/api/docs.md', (_req, res) => {
  res.type('text/markdown; charset=utf-8').status(200).send(buildApiDocsMarkdown());
});

app.get('/api/openapi.json', (req, res) => {
  const protocol = req.header('x-forwarded-proto') ?? req.protocol;
  const host = req.header('x-forwarded-host') ?? req.get('host') ?? 'localhost:3001';
  const serverUrl = `${protocol}://${host}`;
  res.status(200).json(buildOpenApiSpec(serverUrl));
});

app.get('/api/swagger', (_req, res) => {
  res.type('text/html; charset=utf-8').status(200).send(buildSwaggerUiHtml('/api/openapi.json'));
});

function trpcIndexPayload() {
  return {
    message: 'tRPC endpoint is online. Provide a procedure path instead of calling /trpc directly.',
    basePath: '/trpc',
    examples: {
      health: '/trpc/health',
      authLogin: '/trpc/auth.login',
      researchExecute: '/trpc/research.executeQuery'
    },
    docs: {
      swagger: '/api/swagger',
      openapi: '/api/openapi.json',
      apiDocs: '/api/docs'
    },
    procedures: trpcDocs
  };
}

app.get(['/trpc', '/trpc/'], (_req, res) => {
  res.status(200).json(trpcIndexPayload());
});

app.use('/trpc', (req, res, next) => {
  const normalizedPath = req.path.replace(/\/+$/g, '');
  if (normalizedPath === '' || normalizedPath === '/') {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message:
          'No procedure path provided. Use /trpc/<procedurePath> or open /trpc for procedure list.'
      },
      trpc: trpcIndexPayload()
    });
    return;
  }
  next();
});

function getRequestId(req: Request): string {
  return req.header('x-request-id') ?? randomUUID();
}

async function resolveUserId(req: Request): Promise<string | null> {
  const token = getBearerToken(req.header('authorization'));
  if (!token) {
    return null;
  }

  return verifyAccessToken(token);
}

async function requireUserId(req: Request): Promise<string> {
  const userId = await resolveUserId(req);
  if (!userId) {
    throw new Error('Authentication required');
  }

  return userId;
}

async function requireAdminUserId(req: Request): Promise<string> {
  const userId = await requireUserId(req);
  const user = services.authService.getMe(userId);
  if (user.role !== 'admin') {
    throw new Error('Admin privileges required');
  }
  return userId;
}

function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

app.post(
  '/api/auth/register',
  asyncHandler(async (req, res) => {
    const input = registerInputSchema.parse(req.body);
    const result = await services.authService.register(input);
    res.status(201).json(result);
  })
);

app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const input = loginInputSchema.parse(req.body);
    const result = await services.authService.login(input);
    res.status(200).json(result);
  })
);

app.get(
  '/api/auth/me',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const user = services.authService.getMe(userId);
    res.status(200).json(user);
  })
);

app.get(
  '/api/admin/overview',
  asyncHandler(async (req, res) => {
    await requireAdminUserId(req);
    const summary = services.adminService.getOverview();
    res.status(200).json(summary);
  })
);

app.get(
  '/api/admin/users',
  asyncHandler(async (req, res) => {
    await requireAdminUserId(req);
    const users = services.adminService.listUsers();
    res.status(200).json(users);
  })
);

app.post(
  '/api/admin/users/:userId/role',
  asyncHandler(async (req, res) => {
    const actorUserId = await requireAdminUserId(req);
    const userId = String(req.params.userId);
    const role = String(req.body?.role ?? '');
    if (!['user', 'admin'].includes(role)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'role must be user or admin',
          requestId: getRequestId(req)
        }
      });
      return;
    }
    const updated = services.adminService.updateUserRole(actorUserId, userId, role as 'user' | 'admin');
    res.status(200).json(updated);
  })
);

app.get(
  '/api/admin/sessions',
  asyncHandler(async (req, res) => {
    await requireAdminUserId(req);
    const limit = Number(req.query.limit ?? 200);
    const sessions = services.adminService.listSessions(Number.isFinite(limit) ? limit : 200);
    res.status(200).json(sessions);
  })
);

app.get(
  '/api/admin/queries',
  asyncHandler(async (req, res) => {
    await requireAdminUserId(req);
    const limit = Number(req.query.limit ?? 300);
    const queries = services.adminService.listQueries(Number.isFinite(limit) ? limit : 300);
    res.status(200).json(queries);
  })
);

app.get(
  '/api/research/sessions',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const sessions = services.researchService.getSessions(userId);
    res.status(200).json(sessions);
  })
);

app.post(
  '/api/research/sessions',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const input = createSessionInputSchema.parse(req.body);
    const session = services.researchService.createSession(userId, input);
    res.status(201).json(session);
  })
);

app.get(
  '/api/research/sessions/:sessionId/queries',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const sessionId = String(req.params.sessionId);
    const queries = services.researchService.getQueries(userId, sessionId);
    res.status(200).json(queries);
  })
);

app.post(
  '/api/research/execute',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const input = executeQueryInputSchema.parse(req.body);
    const result = await services.researchService.executeQuery(userId, input);
    res.status(200).json(result);
  })
);

app.post(
  '/api/research/execute-async',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const input = executeQueryInputSchema.parse(req.body);
    const job = queryQueue.enqueue(userId, input);
    res.status(202).json(job);
  })
);

app.get(
  '/api/research/jobs/:jobId',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const jobId = String(req.params.jobId);
    const job = queryQueue.getJob(jobId, userId);
    if (!job) {
      res.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Job not found',
          requestId: getRequestId(req)
        }
      });
      return;
    }

    res.status(200).json(job);
  })
);

app.get(
  '/api/system/providers',
  asyncHandler(async (req, res) => {
    await requireUserId(req);
    const diagnostics = await getProviderDiagnostics();
    res.status(200).json(diagnostics);
  })
);

app.get(
  '/api/system/secrets',
  asyncHandler(async (req, res) => {
    await requireUserId(req);
    const validation = getSecretValidation();
    res.status(200).json(validation);
  })
);

app.get(
  '/api/market/ticker/:ticker',
  asyncHandler(async (req, res) => {
    await requireUserId(req);
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    if (!ticker) {
      res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Ticker is required',
          requestId: getRequestId(req)
        }
      });
      return;
    }

    const profileParam = String(req.query.profile ?? 'light').toLowerCase();
    const profile = profileParam === 'full' ? 'full' : 'light';

    const artifacts =
      (await enrichArtifactsWithMarketData(ticker, undefined, {
        profile
      })) ?? {};

    res.status(200).json({
      ticker,
      profile,
      artifacts
    });
  })
);

app.get(
  '/api/watchlists',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const watchlists = services.researchService.getWatchlists(userId);
    res.status(200).json(watchlists);
  })
);

app.post(
  '/api/watchlists',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const input = createWatchlistInputSchema.parse(req.body);
    const watchlist = services.researchService.createWatchlist(userId, input);
    res.status(201).json(watchlist);
  })
);

app.post(
  '/api/watchlists/:watchlistId/items',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const watchlistId = String(req.params.watchlistId);
    const input = upsertWatchlistItemInputSchema.parse(req.body);
    const watchlist = services.researchService.upsertWatchlistItem(userId, watchlistId, input);
    res.status(200).json(watchlist);
  })
);

app.delete(
  '/api/watchlists/:watchlistId/items/:ticker',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const watchlistId = String(req.params.watchlistId);
    const ticker = String(req.params.ticker);
    const watchlist = services.researchService.removeWatchlistItem(userId, watchlistId, ticker);
    res.status(200).json(watchlist);
  })
);

app.delete(
  '/api/watchlists/:watchlistId',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const watchlistId = String(req.params.watchlistId);
    services.researchService.deleteWatchlist(userId, watchlistId);
    res.status(204).send();
  })
);

app.get(
  '/api/budget',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const sessionId = req.query.sessionId ? String(req.query.sessionId) : undefined;
    const snapshot = services.researchService.getBudgetSnapshot(userId, sessionId);
    res.status(200).json(snapshot);
  })
);

app.post(
  '/api/budget/settings',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const patchSchema = budgetSettingsSchema.partial();
    const patch = patchSchema.parse(req.body);
    const updated = services.researchService.updateBudgetSettings(userId, patch);
    res.status(200).json(updated);
  })
);

app.get(
  '/api/workflows/presets',
  asyncHandler(async (req, res) => {
    await requireUserId(req);
    const presets = services.featureService.getGuidedPresets();
    res.status(200).json(presets);
  })
);

app.get(
  '/api/views',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const sessionId = req.query.sessionId ? String(req.query.sessionId) : undefined;
    const presets = services.featureService.listViewPresets(userId, sessionId);
    res.status(200).json(presets);
  })
);

app.post(
  '/api/views',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const payload = req.body as {
      sessionId?: string;
      name?: string;
      mode?: 'guided' | 'advanced';
      workflowId?: string;
      verbosity?: 'short' | 'standard' | 'deep';
    };

    if (!payload.sessionId || !payload.name || !payload.mode || !payload.workflowId || !payload.verbosity) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'sessionId, name, mode, workflowId and verbosity are required',
          requestId: getRequestId(req)
        }
      });
      return;
    }

    const preset = services.featureService.saveViewPreset(userId, {
      sessionId: payload.sessionId,
      name: payload.name,
      mode: payload.mode,
      workflowId: payload.workflowId,
      verbosity: payload.verbosity
    });
    res.status(201).json(preset);
  })
);

app.post(
  '/api/reports/compose',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const sessionId = String(req.body?.sessionId ?? '');
    if (!sessionId) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'sessionId is required',
          requestId: getRequestId(req)
        }
      });
      return;
    }

    const report = services.featureService.composeReport(userId, sessionId);
    res.status(200).json(report);
  })
);

app.post(
  '/api/portfolio/import',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const payload = req.body as {
      name?: string;
      source?: 'csv' | 'alpaca' | 'ibkr' | 'manual';
      csv?: string;
    };
    const name = payload.name?.trim() || 'Imported Portfolio';
    const source = payload.source ?? 'csv';
    const csv = payload.csv ?? '';

    const imported = services.featureService.importPortfolio(userId, {
      name,
      source,
      csv
    });
    res.status(201).json(imported);
  })
);

app.get(
  '/api/portfolio',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const portfolios = services.featureService.listPortfolios(userId);
    res.status(200).json(portfolios);
  })
);

app.get(
  '/api/portfolio/:portfolioId/insights',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const portfolioId = String(req.params.portfolioId);
    const insights = services.featureService.getPortfolioInsights(userId, portfolioId);
    res.status(200).json(insights);
  })
);

app.get(
  '/api/portfolio/:portfolioId/rebalance',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const portfolioId = String(req.params.portfolioId);
    const insights = services.featureService.getPortfolioInsights(userId, portfolioId);
    res.status(200).json({
      portfolioId,
      rebalanceSuggestions: insights.rebalanceSuggestions
    });
  })
);

app.post(
  '/api/portfolio/position-size',
  asyncHandler(async (req, res) => {
    await requireUserId(req);
    const payload = req.body as {
      portfolioValue?: number;
      riskPct?: number;
      entryPrice?: number;
      stopPrice?: number;
    };
    const result = services.featureService.calculatePositionSize({
      portfolioValue: Number(payload.portfolioValue ?? 0),
      riskPct: Number(payload.riskPct ?? 0),
      entryPrice: Number(payload.entryPrice ?? 0),
      stopPrice: Number(payload.stopPrice ?? 0)
    });
    res.status(200).json(result);
  })
);

app.post(
  '/api/alerts',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const payload = req.body as {
      ticker?: string;
      kind?: 'price' | 'earnings' | 'event' | 'scenario';
      operator?: '>' | '>=' | '<' | '<=' | '==';
      threshold?: number;
      metric?: string;
    };
    if (!payload.ticker || !payload.kind || !payload.operator || payload.threshold === undefined || !payload.metric) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'ticker, kind, operator, threshold and metric are required',
          requestId: getRequestId(req)
        }
      });
      return;
    }
    const alert = services.featureService.createAlert(userId, {
      ticker: payload.ticker,
      kind: payload.kind,
      operator: payload.operator,
      threshold: Number(payload.threshold),
      metric: payload.metric
    });
    res.status(201).json(alert);
  })
);

app.get(
  '/api/alerts',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const alerts = services.featureService.listAlerts(userId);
    res.status(200).json(alerts);
  })
);

app.post(
  '/api/alerts/evaluate',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const payload = req.body as {
      prices?: Record<string, number>;
      metrics?: Record<string, number>;
    };
    const evaluations = services.featureService.evaluateAlerts(userId, payload);
    res.status(200).json(evaluations);
  })
);

app.post(
  '/api/journal',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const payload = req.body as {
      sessionId?: string;
      title?: string;
      thesis?: string;
      outcome?: string;
      postMortem?: string;
    };
    if (!payload.sessionId || !payload.title || !payload.thesis) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'sessionId, title and thesis are required',
          requestId: getRequestId(req)
        }
      });
      return;
    }

    const entry = services.featureService.createJournalEntry(userId, {
      sessionId: payload.sessionId,
      title: payload.title,
      thesis: payload.thesis,
      outcome: payload.outcome,
      postMortem: payload.postMortem
    });
    res.status(201).json(entry);
  })
);

app.get(
  '/api/journal',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const sessionId = req.query.sessionId ? String(req.query.sessionId) : undefined;
    const entries = services.featureService.listJournalEntries(userId, sessionId);
    res.status(200).json(entries);
  })
);

app.post(
  '/api/workspaces',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const payload = req.body as {
      name?: string;
      ownerEmail?: string;
    };
    if (!payload.name || !payload.ownerEmail) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'name and ownerEmail are required',
          requestId: getRequestId(req)
        }
      });
      return;
    }

    const workspace = services.featureService.createWorkspace(userId, {
      name: payload.name,
      ownerEmail: payload.ownerEmail
    });
    res.status(201).json(workspace);
  })
);

app.get(
  '/api/workspaces',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const workspaces = services.featureService.listWorkspaces(userId);
    res.status(200).json(workspaces);
  })
);

app.post(
  '/api/workspaces/:workspaceId/members',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const workspaceId = String(req.params.workspaceId);
    const payload = req.body as {
      userEmail?: string;
      role?: 'owner' | 'editor' | 'viewer' | 'approver';
    };
    if (!payload.userEmail || !payload.role) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'userEmail and role are required',
          requestId: getRequestId(req)
        }
      });
      return;
    }
    const workspace = services.featureService.addWorkspaceMember(userId, workspaceId, {
      userEmail: payload.userEmail,
      role: payload.role
    });
    res.status(200).json(workspace);
  })
);

app.post(
  '/api/comments',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const payload = req.body as {
      targetType?: 'query' | 'report' | 'chart';
      targetId?: string;
      body?: string;
    };
    if (!payload.targetType || !payload.targetId || !payload.body) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'targetType, targetId and body are required',
          requestId: getRequestId(req)
        }
      });
      return;
    }
    const comment = services.featureService.createComment(userId, {
      targetType: payload.targetType,
      targetId: payload.targetId,
      body: payload.body
    });
    res.status(201).json(comment);
  })
);

app.get(
  '/api/comments',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const targetType = req.query.targetType ? String(req.query.targetType) : undefined;
    const targetId = req.query.targetId ? String(req.query.targetId) : undefined;
    const comments = services.featureService.listComments(userId, {
      targetType: (targetType as 'query' | 'report' | 'chart' | undefined) ?? undefined,
      targetId
    });
    res.status(200).json(comments);
  })
);

app.post(
  '/api/approvals',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const payload = req.body as {
      targetType?: 'report' | 'note';
      targetId?: string;
      requestedFrom?: string;
    };
    if (!payload.targetType || !payload.targetId || !payload.requestedFrom) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'targetType, targetId and requestedFrom are required',
          requestId: getRequestId(req)
        }
      });
      return;
    }
    const approval = services.featureService.createApproval(userId, {
      targetType: payload.targetType,
      targetId: payload.targetId,
      requestedFrom: payload.requestedFrom
    });
    res.status(201).json(approval);
  })
);

app.get(
  '/api/approvals',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const approvals = services.featureService.listApprovals(userId);
    res.status(200).json(approvals);
  })
);

app.post(
  '/api/approvals/:approvalId/decision',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const approvalId = String(req.params.approvalId);
    const payload = req.body as {
      status?: 'approved' | 'rejected';
      decidedBy?: string;
    };
    if (!payload.status || !payload.decidedBy) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'status and decidedBy are required',
          requestId: getRequestId(req)
        }
      });
      return;
    }
    const result = services.featureService.decideApproval(userId, approvalId, {
      status: payload.status,
      decidedBy: payload.decidedBy
    });
    res.status(200).json(result);
  })
);

app.post(
  '/api/share-links',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const payload = req.body as {
      targetType?: 'report' | 'session';
      targetId?: string;
      expiresInHours?: number;
    };
    if (!payload.targetType || !payload.targetId) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'targetType and targetId are required',
          requestId: getRequestId(req)
        }
      });
      return;
    }
    const link = services.featureService.createShareLink(userId, {
      targetType: payload.targetType,
      targetId: payload.targetId,
      expiresInHours: Number(payload.expiresInHours ?? 24)
    });
    res.status(201).json(link);
  })
);

app.get(
  '/api/share-links',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const links = services.featureService.listShareLinks(userId);
    res.status(200).json(links);
  })
);

app.post(
  '/api/distribution/send',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const payload = req.body as {
      channel?: 'slack' | 'discord' | 'email';
      target?: string;
      targetType?: 'report' | 'session';
      targetId?: string;
    };
    if (!payload.channel || !payload.target || !payload.targetType || !payload.targetId) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'channel, target, targetType and targetId are required',
          requestId: getRequestId(req)
        }
      });
      return;
    }
    const log = services.featureService.distributeReport(userId, {
      channel: payload.channel,
      target: payload.target,
      targetType: payload.targetType,
      targetId: payload.targetId
    });
    res.status(200).json(log);
  })
);

app.get(
  '/api/distribution/logs',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const logs = services.featureService.listDistributionLogs(userId);
    res.status(200).json(logs);
  })
);

app.post(
  '/api/webhooks',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const payload = req.body as {
      name?: string;
      url?: string;
      secret?: string;
    };
    if (!payload.name || !payload.url) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'name and url are required',
          requestId: getRequestId(req)
        }
      });
      return;
    }
    const webhook = services.featureService.registerWebhook(userId, {
      name: payload.name,
      url: payload.url,
      secret: payload.secret
    });
    res.status(201).json(webhook);
  })
);

app.get(
  '/api/webhooks',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const hooks = services.featureService.listWebhooks(userId);
    res.status(200).json(hooks);
  })
);

app.post(
  '/api/webhooks/:webhookId/test',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const webhookId = String(req.params.webhookId);
    const result = services.featureService.testWebhook(userId, webhookId);
    res.status(200).json(result);
  })
);

app.get(
  '/api/enterprise/settings',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const settings = services.featureService.getEnterpriseSettings(userId);
    res.status(200).json(settings);
  })
);

app.post(
  '/api/enterprise/settings',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const patch = req.body as Record<string, unknown>;
    const settings = services.featureService.updateEnterpriseSettings(
      userId,
      patch as Parameters<typeof services.featureService.updateEnterpriseSettings>[1]
    );
    res.status(200).json(settings);
  })
);

app.get(
  '/api/enterprise/sso-url',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const provider = String(req.query.provider ?? '') as 'google' | 'microsoft' | 'okta';
    if (!['google', 'microsoft', 'okta'].includes(provider)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'provider must be google, microsoft or okta',
          requestId: getRequestId(req)
        }
      });
      return;
    }
    const payload = services.featureService.getSsoLaunchUrl(userId, provider);
    res.status(200).json(payload);
  })
);

app.get(
  '/api/enterprise/billing',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const billing = services.featureService.getBillingOverview(userId);
    res.status(200).json(billing);
  })
);

app.get(
  '/api/compliance/controls',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const controls = services.featureService.getComplianceControls(userId);
    res.status(200).json(controls);
  })
);

app.post(
  '/api/compliance/controls',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const patch = req.body as {
      piiRedaction?: boolean;
      retentionDays?: number;
    };
    const controls = services.featureService.updateComplianceControls(userId, {
      piiRedaction: patch.piiRedaction,
      retentionDays: patch.retentionDays
    });
    res.status(200).json(controls);
  })
);

app.post(
  '/api/compliance/redact-preview',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const text = String(req.body?.text ?? '');
    const preview = services.featureService.previewRedaction(userId, text);
    res.status(200).json(preview);
  })
);

app.post(
  '/api/compliance/retention/run',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const summary = services.featureService.runRetentionSweep(userId);
    res.status(200).json(summary);
  })
);

app.post(
  '/api/weekly-brief/generate',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const weekStart = req.body?.weekStart ? String(req.body.weekStart) : undefined;
    const brief = services.featureService.generateWeeklyBrief(userId, weekStart);
    res.status(201).json(brief);
  })
);

app.get(
  '/api/weekly-briefs',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const briefs = services.featureService.listWeeklyBriefs(userId);
    res.status(200).json(briefs);
  })
);

app.get(
  '/api/session-memory/:sessionId',
  asyncHandler(async (req, res) => {
    const userId = await requireUserId(req);
    const sessionId = String(req.params.sessionId);
    const memory = services.featureService.summarizeSessionMemory(userId, sessionId);
    res.status(200).json(memory);
  })
);

app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext: async ({ req }): Promise<AppContext> => {
      let userId: string | null = null;

      try {
        userId = await resolveUserId(req);
      } catch {
        userId = null;
      }

      return {
        requestId: getRequestId(req),
        userId,
        services
      };
    }
  })
);

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  void _next;
  const requestId = getRequestId(req);

  if (isAppError(error)) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        requestId
      }
    });
    return;
  }

  if (error instanceof Error && error.message === 'Authentication required') {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        requestId
      }
    });
    return;
  }

  if (error instanceof Error && error.message === 'Admin privileges required') {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin privileges required',
        requestId
      }
    });
    return;
  }

  if (error instanceof Error && error.name === 'ZodError') {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        requestId
      }
    });
    return;
  }

  const logEvent = {
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'api',
    requestId,
    message: error instanceof Error ? error.message : 'Unknown server error'
  };
  console.error(JSON.stringify(logEvent));

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected server error',
      requestId
    }
  });
});

app.listen(port, () => {
  const logEvent = {
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'api',
    message: 'api_server_started',
    port,
    agentMode: process.env.FINMIND_AGENT_MODE ?? 'mock'
  };

  console.log(JSON.stringify(logEvent));
});
