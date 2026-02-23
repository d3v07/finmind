import {
  budgetSettingsSchema,
  createSessionInputSchema,
  createWatchlistInputSchema,
  executeQueryInputSchema,
  loginInputSchema,
  registerInputSchema,
  upsertWatchlistItemInputSchema
} from '@finmind/shared';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

type HttpMethod = 'GET' | 'POST' | 'DELETE';
type AuthType = 'public' | 'bearer';

export type ApiDocEntry = {
  method: HttpMethod;
  path: string;
  auth: AuthType;
  description: string;
};

export type TrpcDocEntry = {
  procedure: string;
  type: 'query' | 'mutation';
  auth: AuthType;
  description: string;
};

export const restApiDocs: ApiDocEntry[] = [
  { method: 'GET', path: '/', auth: 'public', description: 'API root metadata' },
  { method: 'GET', path: '/health', auth: 'public', description: 'Health probe' },
  { method: 'GET', path: '/ready', auth: 'public', description: 'Readiness probe' },

  { method: 'POST', path: '/api/auth/register', auth: 'public', description: 'Register user and return JWT' },
  { method: 'POST', path: '/api/auth/login', auth: 'public', description: 'Login user and return JWT' },
  { method: 'GET', path: '/api/auth/me', auth: 'bearer', description: 'Get current user profile' },

  { method: 'GET', path: '/api/admin/overview', auth: 'bearer', description: 'Admin system overview' },
  { method: 'GET', path: '/api/admin/users', auth: 'bearer', description: 'Admin list users' },
  {
    method: 'POST',
    path: '/api/admin/users/:userId/role',
    auth: 'bearer',
    description: 'Admin update user role'
  },
  { method: 'GET', path: '/api/admin/sessions', auth: 'bearer', description: 'Admin list sessions' },
  { method: 'GET', path: '/api/admin/queries', auth: 'bearer', description: 'Admin list queries' },

  { method: 'GET', path: '/api/research/sessions', auth: 'bearer', description: 'List research sessions' },
  { method: 'POST', path: '/api/research/sessions', auth: 'bearer', description: 'Create research session' },
  {
    method: 'GET',
    path: '/api/research/sessions/:sessionId/queries',
    auth: 'bearer',
    description: 'List session query history'
  },
  { method: 'POST', path: '/api/research/execute', auth: 'bearer', description: 'Execute research query' },
  {
    method: 'POST',
    path: '/api/research/execute-async',
    auth: 'bearer',
    description: 'Queue async research job'
  },
  { method: 'GET', path: '/api/research/jobs/:jobId', auth: 'bearer', description: 'Get async job status' },

  { method: 'GET', path: '/api/system/providers', auth: 'bearer', description: 'Provider diagnostics' },
  { method: 'GET', path: '/api/system/secrets', auth: 'bearer', description: 'Secret validation status' },
  {
    method: 'GET',
    path: '/api/market/ticker/:ticker',
    auth: 'bearer',
    description: 'Ticker snapshot artifacts (price/metrics/news/earnings)'
  },

  { method: 'GET', path: '/api/watchlists', auth: 'bearer', description: 'List watchlists' },
  { method: 'POST', path: '/api/watchlists', auth: 'bearer', description: 'Create watchlist' },
  {
    method: 'POST',
    path: '/api/watchlists/:watchlistId/items',
    auth: 'bearer',
    description: 'Add or update watchlist ticker'
  },
  {
    method: 'DELETE',
    path: '/api/watchlists/:watchlistId/items/:ticker',
    auth: 'bearer',
    description: 'Remove ticker from watchlist'
  },
  {
    method: 'DELETE',
    path: '/api/watchlists/:watchlistId',
    auth: 'bearer',
    description: 'Delete watchlist'
  },

  { method: 'GET', path: '/api/budget', auth: 'bearer', description: 'Budget snapshot' },
  { method: 'POST', path: '/api/budget/settings', auth: 'bearer', description: 'Update budget settings' },

  { method: 'GET', path: '/api/workflows/presets', auth: 'bearer', description: 'Guided workflow presets' },
  { method: 'GET', path: '/api/views', auth: 'bearer', description: 'List saved view presets' },
  { method: 'POST', path: '/api/views', auth: 'bearer', description: 'Save view preset' },
  { method: 'POST', path: '/api/reports/compose', auth: 'bearer', description: 'Compose investment memo report' },

  { method: 'POST', path: '/api/portfolio/import', auth: 'bearer', description: 'Import portfolio (CSV)' },
  { method: 'GET', path: '/api/portfolio', auth: 'bearer', description: 'List portfolios' },
  {
    method: 'GET',
    path: '/api/portfolio/:portfolioId/insights',
    auth: 'bearer',
    description: 'Portfolio factor/concentration insights'
  },
  {
    method: 'GET',
    path: '/api/portfolio/:portfolioId/rebalance',
    auth: 'bearer',
    description: 'Rebalance suggestions'
  },
  {
    method: 'POST',
    path: '/api/portfolio/position-size',
    auth: 'bearer',
    description: 'Risk-based position sizing assistant'
  },

  { method: 'POST', path: '/api/alerts', auth: 'bearer', description: 'Create alert rule' },
  { method: 'GET', path: '/api/alerts', auth: 'bearer', description: 'List alert rules' },
  { method: 'POST', path: '/api/alerts/evaluate', auth: 'bearer', description: 'Evaluate alert triggers' },

  { method: 'POST', path: '/api/journal', auth: 'bearer', description: 'Create decision journal entry' },
  { method: 'GET', path: '/api/journal', auth: 'bearer', description: 'List journal entries' },

  { method: 'POST', path: '/api/workspaces', auth: 'bearer', description: 'Create workspace' },
  { method: 'GET', path: '/api/workspaces', auth: 'bearer', description: 'List workspaces' },
  {
    method: 'POST',
    path: '/api/workspaces/:workspaceId/members',
    auth: 'bearer',
    description: 'Add workspace member'
  },

  { method: 'POST', path: '/api/comments', auth: 'bearer', description: 'Create comment/annotation' },
  { method: 'GET', path: '/api/comments', auth: 'bearer', description: 'List comments' },

  { method: 'POST', path: '/api/approvals', auth: 'bearer', description: 'Create approval request' },
  { method: 'GET', path: '/api/approvals', auth: 'bearer', description: 'List approval requests' },
  {
    method: 'POST',
    path: '/api/approvals/:approvalId/decision',
    auth: 'bearer',
    description: 'Approve/reject request'
  },

  { method: 'POST', path: '/api/share-links', auth: 'bearer', description: 'Create expiring share link' },
  { method: 'GET', path: '/api/share-links', auth: 'bearer', description: 'List share links' },

  {
    method: 'POST',
    path: '/api/distribution/send',
    auth: 'bearer',
    description: 'Send report snapshot to channel'
  },
  {
    method: 'GET',
    path: '/api/distribution/logs',
    auth: 'bearer',
    description: 'List distribution logs'
  },

  { method: 'POST', path: '/api/webhooks', auth: 'bearer', description: 'Register webhook endpoint' },
  { method: 'GET', path: '/api/webhooks', auth: 'bearer', description: 'List webhook endpoints' },
  {
    method: 'POST',
    path: '/api/webhooks/:webhookId/test',
    auth: 'bearer',
    description: 'Send webhook test event'
  },

  { method: 'GET', path: '/api/enterprise/settings', auth: 'bearer', description: 'Get enterprise settings' },
  {
    method: 'POST',
    path: '/api/enterprise/settings',
    auth: 'bearer',
    description: 'Update enterprise settings'
  },
  {
    method: 'GET',
    path: '/api/enterprise/sso-url',
    auth: 'bearer',
    description: 'Get SSO launch URL by provider'
  },
  { method: 'GET', path: '/api/enterprise/billing', auth: 'bearer', description: 'Billing/usage overview' },

  { method: 'GET', path: '/api/compliance/controls', auth: 'bearer', description: 'Get compliance controls' },
  {
    method: 'POST',
    path: '/api/compliance/controls',
    auth: 'bearer',
    description: 'Update compliance controls'
  },
  {
    method: 'POST',
    path: '/api/compliance/redact-preview',
    auth: 'bearer',
    description: 'PII redaction preview'
  },
  {
    method: 'POST',
    path: '/api/compliance/retention/run',
    auth: 'bearer',
    description: 'Retention sweep preview'
  },

  {
    method: 'POST',
    path: '/api/weekly-brief/generate',
    auth: 'bearer',
    description: 'Generate weekly brief'
  },
  { method: 'GET', path: '/api/weekly-briefs', auth: 'bearer', description: 'List weekly briefs' },
  {
    method: 'GET',
    path: '/api/session-memory/:sessionId',
    auth: 'bearer',
    description: 'Session memory summary'
  }
];

export const trpcDocs: TrpcDocEntry[] = [
  { procedure: 'health', type: 'query', auth: 'public', description: 'tRPC health query' },
  { procedure: 'auth.register', type: 'mutation', auth: 'public', description: 'Register user' },
  { procedure: 'auth.login', type: 'mutation', auth: 'public', description: 'Login user' },
  { procedure: 'auth.me', type: 'query', auth: 'bearer', description: 'Get current user profile' },
  {
    procedure: 'research.createSession',
    type: 'mutation',
    auth: 'bearer',
    description: 'Create research session'
  },
  { procedure: 'research.getSessions', type: 'query', auth: 'bearer', description: 'List sessions' },
  {
    procedure: 'research.getQueries',
    type: 'query',
    auth: 'bearer',
    description: 'List queries by session'
  },
  {
    procedure: 'research.executeQuery',
    type: 'mutation',
    auth: 'bearer',
    description: 'Execute research query'
  }
];

const viewPresetCreateSchema = z.object({
  sessionId: z.string().min(1),
  name: z.string().min(1),
  mode: z.enum(['guided', 'advanced']),
  workflowId: z.string().min(1),
  verbosity: z.enum(['short', 'standard', 'deep'])
});

const reportComposeSchema = z.object({
  sessionId: z.string().min(1)
});

const portfolioImportSchema = z.object({
  name: z.string().min(1).optional(),
  source: z.enum(['csv', 'alpaca', 'ibkr', 'manual']).optional(),
  csv: z.string().optional()
});

const positionSizingSchema = z.object({
  portfolioValue: z.number(),
  riskPct: z.number(),
  entryPrice: z.number(),
  stopPrice: z.number()
});

const alertCreateSchema = z.object({
  ticker: z.string().min(1),
  kind: z.enum(['price', 'earnings', 'event', 'scenario']),
  operator: z.enum(['>', '>=', '<', '<=', '==']),
  threshold: z.number(),
  metric: z.string().min(1)
});

const alertEvaluateSchema = z.object({
  prices: z.record(z.number()).optional(),
  metrics: z.record(z.number()).optional()
});

const journalCreateSchema = z.object({
  sessionId: z.string().min(1),
  title: z.string().min(1),
  thesis: z.string().min(1),
  outcome: z.string().optional(),
  postMortem: z.string().optional()
});

const workspaceCreateSchema = z.object({
  name: z.string().min(1),
  ownerEmail: z.string().email()
});

const workspaceMemberSchema = z.object({
  userEmail: z.string().email(),
  role: z.enum(['owner', 'editor', 'viewer', 'approver'])
});

const commentCreateSchema = z.object({
  targetType: z.enum(['query', 'report', 'chart']),
  targetId: z.string().min(1),
  body: z.string().min(1)
});

const commentQuerySchema = z.object({
  targetType: z.enum(['query', 'report', 'chart']).optional(),
  targetId: z.string().optional()
});

const approvalCreateSchema = z.object({
  targetType: z.enum(['report', 'note']),
  targetId: z.string().min(1),
  requestedFrom: z.string().min(1)
});

const approvalDecisionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  decidedBy: z.string().min(1)
});

const shareLinkSchema = z.object({
  targetType: z.enum(['report', 'session']),
  targetId: z.string().min(1),
  expiresInHours: z.number().optional()
});

const distributionSchema = z.object({
  channel: z.enum(['slack', 'discord', 'email']),
  target: z.string().min(1),
  targetType: z.enum(['report', 'session']),
  targetId: z.string().min(1)
});

const webhookCreateSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  secret: z.string().optional()
});

const enterprisePatchSchema = z.object({
  sso: z
    .object({
      googleEnabled: z.boolean().optional(),
      microsoftEnabled: z.boolean().optional(),
      oktaEnabled: z.boolean().optional(),
      oktaDomain: z.string().nullable().optional()
    })
    .optional(),
  billing: z
    .object({
      monthlyQuota: z.number().optional(),
      teamBudgetCap: z.number().optional()
    })
    .optional(),
  compliance: z
    .object({
      piiRedaction: z.boolean().optional(),
      retentionDays: z.number().optional()
    })
    .optional(),
  branding: z
    .object({
      themeName: z.string().optional(),
      primaryColor: z.string().optional(),
      secondaryColor: z.string().optional(),
      customDomain: z.string().nullable().optional()
    })
    .optional()
});

const ssoQuerySchema = z.object({
  provider: z.enum(['google', 'microsoft', 'okta'])
});

const compliancePatchSchema = z.object({
  piiRedaction: z.boolean().optional(),
  retentionDays: z.number().optional()
});

const redactPreviewSchema = z.object({
  text: z.string()
});

const weeklyBriefGenerateSchema = z.object({
  weekStart: z.string().optional()
});

const adminRoleUpdateSchema = z.object({
  role: z.enum(['user', 'admin'])
});

const adminLimitQuerySchema = z.object({
  limit: z.number().optional()
});

const budgetQuerySchema = z.object({
  sessionId: z.string().optional()
});

const viewQuerySchema = z.object({
  sessionId: z.string().optional()
});

const marketTickerQuerySchema = z.object({
  profile: z.enum(['light', 'full']).optional()
});

type RouteSchemas = {
  query?: z.ZodTypeAny;
  requestBody?: z.ZodTypeAny;
};

const routeSchemas: Record<string, RouteSchemas> = {
  'POST /api/auth/register': { requestBody: registerInputSchema },
  'POST /api/auth/login': { requestBody: loginInputSchema },
  'POST /api/admin/users/:userId/role': { requestBody: adminRoleUpdateSchema },
  'GET /api/admin/sessions': { query: adminLimitQuerySchema },
  'GET /api/admin/queries': { query: adminLimitQuerySchema },
  'POST /api/research/sessions': { requestBody: createSessionInputSchema },
  'POST /api/research/execute': { requestBody: executeQueryInputSchema },
  'POST /api/research/execute-async': { requestBody: executeQueryInputSchema },
  'GET /api/market/ticker/:ticker': { query: marketTickerQuerySchema },
  'POST /api/watchlists': { requestBody: createWatchlistInputSchema },
  'POST /api/watchlists/:watchlistId/items': { requestBody: upsertWatchlistItemInputSchema },
  'GET /api/budget': { query: budgetQuerySchema },
  'POST /api/budget/settings': { requestBody: budgetSettingsSchema.partial() },
  'GET /api/views': { query: viewQuerySchema },
  'POST /api/views': { requestBody: viewPresetCreateSchema },
  'POST /api/reports/compose': { requestBody: reportComposeSchema },
  'POST /api/portfolio/import': { requestBody: portfolioImportSchema },
  'POST /api/portfolio/position-size': { requestBody: positionSizingSchema },
  'POST /api/alerts': { requestBody: alertCreateSchema },
  'POST /api/alerts/evaluate': { requestBody: alertEvaluateSchema },
  'POST /api/journal': { requestBody: journalCreateSchema },
  'POST /api/workspaces': { requestBody: workspaceCreateSchema },
  'POST /api/workspaces/:workspaceId/members': { requestBody: workspaceMemberSchema },
  'POST /api/comments': { requestBody: commentCreateSchema },
  'GET /api/comments': { query: commentQuerySchema },
  'POST /api/approvals': { requestBody: approvalCreateSchema },
  'POST /api/approvals/:approvalId/decision': { requestBody: approvalDecisionSchema },
  'POST /api/share-links': { requestBody: shareLinkSchema },
  'POST /api/distribution/send': { requestBody: distributionSchema },
  'POST /api/webhooks': { requestBody: webhookCreateSchema },
  'POST /api/enterprise/settings': { requestBody: enterprisePatchSchema },
  'GET /api/enterprise/sso-url': { query: ssoQuerySchema },
  'POST /api/compliance/controls': { requestBody: compliancePatchSchema },
  'POST /api/compliance/redact-preview': { requestBody: redactPreviewSchema },
  'POST /api/weekly-brief/generate': { requestBody: weeklyBriefGenerateSchema }
};

const routeExamples: Record<
  string,
  {
    requestBody?: unknown;
    query?: Record<string, string | number | boolean>;
  }
> = {
  'POST /api/auth/register': {
    requestBody: {
      email: 'analyst@example.com',
      name: 'FinMind Analyst',
      password: 'StrongPassword123'
    }
  },
  'POST /api/auth/login': {
    requestBody: {
      email: 'analyst@example.com',
      password: 'StrongPassword123'
    }
  },
  'POST /api/admin/users/:userId/role': {
    requestBody: {
      role: 'admin'
    }
  },
  'GET /api/admin/sessions': {
    query: {
      limit: 200
    }
  },
  'GET /api/admin/queries': {
    query: {
      limit: 300
    }
  },
  'POST /api/research/sessions': {
    requestBody: {
      title: 'Semiconductor Rotation',
      description: 'Short-term setup for AI infra names'
    }
  },
  'POST /api/research/execute': {
    requestBody: {
      sessionId: 'session-id',
      query: 'Compare NVDA vs AMD for a 1-4 week window.',
      mode: 'guided',
      verbosity: 'short'
    }
  },
  'POST /api/research/execute-async': {
    requestBody: {
      sessionId: 'session-id',
      query: 'Run deep risk-stress analysis for TSLA.',
      mode: 'advanced',
      verbosity: 'deep'
    }
  },
  'GET /api/market/ticker/:ticker': {
    query: {
      profile: 'light'
    }
  },
  'GET /api/budget': {
    query: {
      sessionId: 'session-id'
    }
  },
  'POST /api/budget/settings': {
    requestBody: {
      dailyBudgetCap: 50,
      monthlyBudgetCap: 500,
      perSessionCap: 100,
      perQueryCap: 10
    }
  },
  'GET /api/views': {
    query: {
      sessionId: 'session-id'
    }
  },
  'POST /api/views': {
    requestBody: {
      sessionId: 'session-id',
      name: 'Earnings Snapshot',
      mode: 'guided',
      workflowId: 'earnings_snapshot',
      verbosity: 'short'
    }
  },
  'POST /api/reports/compose': {
    requestBody: {
      sessionId: 'session-id'
    }
  },
  'POST /api/portfolio/import': {
    requestBody: {
      name: 'Main Portfolio',
      source: 'csv',
      csv: 'ticker,shares,costBasis,sector\nAAPL,10,185,Technology'
    }
  },
  'POST /api/portfolio/position-size': {
    requestBody: {
      portfolioValue: 100000,
      riskPct: 1,
      entryPrice: 100,
      stopPrice: 95
    }
  },
  'POST /api/alerts': {
    requestBody: {
      ticker: 'AAPL',
      kind: 'price',
      operator: '>',
      threshold: 200,
      metric: 'lastPrice'
    }
  },
  'POST /api/alerts/evaluate': {
    requestBody: {
      prices: {
        AAPL: 205
      },
      metrics: {
        AAPL: 205
      }
    }
  },
  'POST /api/journal': {
    requestBody: {
      sessionId: 'session-id',
      title: 'NVDA Earnings Thesis',
      thesis: 'Momentum and estimates revision remain strong',
      outcome: 'pending'
    }
  },
  'POST /api/workspaces': {
    requestBody: {
      name: 'Research Team',
      ownerEmail: 'owner@example.com'
    }
  },
  'POST /api/workspaces/:workspaceId/members': {
    requestBody: {
      userEmail: 'member@example.com',
      role: 'editor'
    }
  },
  'POST /api/comments': {
    requestBody: {
      targetType: 'query',
      targetId: 'query-id',
      body: 'Strong catalyst framing, verify downside scenario.'
    }
  },
  'GET /api/comments': {
    query: {
      targetType: 'query',
      targetId: 'query-id'
    }
  },
  'POST /api/approvals': {
    requestBody: {
      targetType: 'report',
      targetId: 'report-id',
      requestedFrom: 'approver@example.com'
    }
  },
  'POST /api/approvals/:approvalId/decision': {
    requestBody: {
      status: 'approved',
      decidedBy: 'lead-analyst@example.com'
    }
  },
  'POST /api/share-links': {
    requestBody: {
      targetType: 'session',
      targetId: 'session-id',
      expiresInHours: 24
    }
  },
  'POST /api/distribution/send': {
    requestBody: {
      channel: 'email',
      target: 'team@example.com',
      targetType: 'session',
      targetId: 'session-id'
    }
  },
  'POST /api/webhooks': {
    requestBody: {
      name: 'Research Automation',
      url: 'https://example.com/webhook',
      secret: 'optional-secret'
    }
  },
  'POST /api/enterprise/settings': {
    requestBody: {
      sso: {
        googleEnabled: true
      },
      billing: {
        monthlyQuota: 1500
      },
      compliance: {
        piiRedaction: true,
        retentionDays: 365
      },
      branding: {
        themeName: 'finmind-default',
        primaryColor: '#0d7a6d'
      }
    }
  },
  'GET /api/enterprise/sso-url': {
    query: {
      provider: 'google'
    }
  },
  'POST /api/compliance/controls': {
    requestBody: {
      piiRedaction: true,
      retentionDays: 365
    }
  },
  'POST /api/compliance/redact-preview': {
    requestBody: {
      text: 'Contact me at analyst@example.com'
    }
  },
  'POST /api/weekly-brief/generate': {
    requestBody: {
      weekStart: '2026-02-02'
    }
  }
};

function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodDefault ||
    current instanceof z.ZodNullable ||
    current instanceof z.ZodEffects
  ) {
    if (current instanceof z.ZodEffects) {
      current = current._def.schema as z.ZodTypeAny;
      continue;
    }
    current = current._def.innerType as z.ZodTypeAny;
  }
  return current;
}

function toOpenApiSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const converted = zodToJsonSchema(schema, {
    target: 'openApi3',
    $refStrategy: 'none'
  }) as Record<string, unknown>;

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(converted)) {
    if (key === '$schema' || key === 'definitions' || key === '$ref') {
      continue;
    }
    cleaned[key] = value;
  }
  return cleaned;
}

function getObjectShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> | null {
  const unwrapped = unwrapSchema(schema);
  if (unwrapped instanceof z.ZodObject) {
    return unwrapped.shape;
  }
  return null;
}

function isOptionalField(schema: z.ZodTypeAny): boolean {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    return true;
  }
  if (schema instanceof z.ZodEffects) {
    return isOptionalField(schema._def.schema as z.ZodTypeAny);
  }
  return false;
}

export function buildApiDocsPayload() {
  return {
    name: 'FinMind API',
    generatedAt: new Date().toISOString(),
    transport: {
      restBase: '/',
      trpcBase: '/trpc'
    },
    auth: {
      type: 'Bearer JWT',
      header: 'Authorization: Bearer <token>'
    },
    rest: restApiDocs,
    trpc: {
      notes: [
        'Use HTTP POST /trpc/<procedurePath> for mutations and queries when using raw HTTP.',
        'Prefer a tRPC client in frontend/server code for type-safe calls.'
      ],
      procedures: trpcDocs
    }
  };
}

export function buildApiDocsMarkdown() {
  const restLines = restApiDocs.map(
    (entry) => `- \`${entry.method}\` \`${entry.path}\` [${entry.auth}] - ${entry.description}`
  );
  const trpcLines = trpcDocs.map(
    (entry) => `- \`${entry.type}\` \`${entry.procedure}\` [${entry.auth}] - ${entry.description}`
  );

  return [
    '# FinMind API Documentation',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Authentication',
    '- Header: `Authorization: Bearer <token>`',
    '',
    '## REST Endpoints',
    ...restLines,
    '',
    '## tRPC',
    '- Base path: `/trpc`',
    '- Prefer a typed tRPC client where possible.',
    ...trpcLines,
    ''
  ].join('\n');
}

function inferTag(path: string): string {
  if (!path.startsWith('/api/')) {
    if (path.startsWith('/health') || path.startsWith('/ready')) {
      return 'system';
    }
    return 'root';
  }

  const parts = path.split('/').filter(Boolean);
  return parts[1] ?? 'api';
}

function toOpenApiPath(path: string): {
  openapiPath: string;
  parameters: Array<{
    in: 'path';
    name: string;
    required: true;
    schema: { type: 'string' };
  }>;
} {
  const segments = path.split('/');
  const parameters: Array<{
    in: 'path';
    name: string;
    required: true;
    schema: { type: 'string' };
  }> = [];

  const transformed = segments.map((segment) => {
    if (!segment.startsWith(':')) {
      return segment;
    }

    const name = segment.slice(1);
    if (name.length > 0) {
      parameters.push({
        in: 'path',
        name,
        required: true,
        schema: { type: 'string' }
      });
      return `{${name}}`;
    }

    return segment;
  });

  return {
    openapiPath: transformed.join('/'),
    parameters
  };
}

export function buildOpenApiSpec(serverUrl = 'http://localhost:3001') {
  function hasRequiredFields(schema: z.ZodTypeAny): boolean {
    const shape = getObjectShape(schema);
    if (!shape) {
      return true;
    }
    return Object.values(shape).some((field) => !isOptionalField(field));
  }

  const paths: Record<string, Record<string, unknown>> = {};

  for (const entry of restApiDocs) {
    const routeKey = `${entry.method} ${entry.path}`;
    const { openapiPath, parameters } = toOpenApiPath(entry.path);
    const methodKey = entry.method.toLowerCase();
    const tag = inferTag(entry.path);
    const schemaConfig = routeSchemas[routeKey];
    const exampleConfig = routeExamples[routeKey];

    const allParameters: Array<{
      in: 'path' | 'query';
      name: string;
      required: boolean;
      schema: Record<string, unknown>;
      example?: string | number | boolean;
    }> = [
      ...parameters.map((parameter) => ({
        in: parameter.in,
        name: parameter.name,
        required: parameter.required,
        schema: parameter.schema
      }))
    ];

    if (schemaConfig?.query) {
      const shape = getObjectShape(schemaConfig.query);
      if (shape) {
        for (const [name, fieldSchema] of Object.entries(shape)) {
          allParameters.push({
            in: 'query',
            name,
            required: !isOptionalField(fieldSchema),
            schema: toOpenApiSchema(unwrapSchema(fieldSchema)),
            example: exampleConfig?.query?.[name]
          });
        }
      }
    }

    const responses: Record<string, { description: string }> = {
      '200': {
        description: 'Success'
      },
      '400': {
        description: 'Validation error'
      },
      '401': {
        description: 'Unauthorized'
      },
      '500': {
        description: 'Server error'
      }
    };

    const operation: {
      [key: string]: unknown;
      responses: Record<string, { description: string }>;
    } = {
      tags: [tag],
      summary: entry.description,
      description: entry.description,
      responses
    };

    if (allParameters.length > 0) {
      operation.parameters = allParameters;
    }

    if (entry.auth === 'bearer') {
      operation.security = [{ bearerAuth: [] }];
    }

    if (schemaConfig?.requestBody) {
      operation.requestBody = {
        required: hasRequiredFields(schemaConfig.requestBody),
        content: {
          'application/json': {
            schema: {
              ...toOpenApiSchema(schemaConfig.requestBody)
            },
            ...(exampleConfig?.requestBody ? { example: exampleConfig.requestBody } : {})
          }
        }
      };
    }

    if (entry.method === 'POST') {
      operation.responses = {
        ...operation.responses,
        '201': {
          description: 'Created'
        }
      };
    }

    if (entry.method === 'DELETE') {
      operation.responses = {
        ...operation.responses,
        '204': {
          description: 'No content'
        }
      };
    }

    if (!paths[openapiPath]) {
      paths[openapiPath] = {};
    }

    paths[openapiPath][methodKey] = operation;
  }

  paths['/trpc/{procedurePath}'] = {
    post: {
      tags: ['trpc'],
      summary: 'tRPC procedure endpoint',
      description:
        'Invoke tRPC procedures over HTTP. Use a tRPC client for type-safe requests/responses in production.',
      parameters: [
        {
          in: 'path',
          name: 'procedurePath',
          required: true,
          schema: {
            type: 'string'
          }
        }
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: true
            }
          }
        }
      },
      responses: {
        '200': { description: 'Success' },
        '400': { description: 'Validation error' },
        '401': { description: 'Unauthorized' },
        '404': { description: 'Procedure not found' },
        '500': { description: 'Server error' }
      }
    }
  };

  return {
    openapi: '3.0.3',
    info: {
      title: 'FinMind API',
      version: '1.0.0',
      description:
        'REST API for FinMind. tRPC procedures are listed under x-trpc-procedures for reference.'
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    paths,
    'x-trpc-procedures': trpcDocs
  };
}

export function buildSwaggerUiHtml(specUrl = '/api/openapi.json') {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FinMind API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '${specUrl}',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout',
      docExpansion: 'none'
    });
  </script>
</body>
</html>`;
}
