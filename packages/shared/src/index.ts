import { z } from 'zod';

export const userRoleSchema = z.enum(['user', 'admin']);

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: userRoleSchema,
  createdAt: z.string()
});

export const sessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const queryStatusSchema = z.enum(['pending', 'completed', 'failed']);
export const queryModeSchema = z.enum(['guided', 'advanced']);
export const queryVerbositySchema = z.enum(['short', 'standard', 'deep']);

export const pricePointSchema = z.object({
  label: z.string(),
  value: z.number()
});

export const priceChartSchema = z.object({
  ticker: z.string(),
  title: z.string(),
  points: z.array(pricePointSchema),
  changePct: z.number().nullable()
});

export const comparisonMetricRowSchema = z.object({
  metric: z.string(),
  leftTicker: z.string(),
  rightTicker: z.string(),
  leftValue: z.number().nullable(),
  rightValue: z.number().nullable(),
  delta: z.number().nullable()
});

export const comparisonTableSchema = z.object({
  title: z.string(),
  rows: z.array(comparisonMetricRowSchema)
});

export const metricSnapshotSchema = z.object({
  ticker: z.string(),
  price_to_earnings_ratio: z.number().nullable().optional(),
  price_to_sales_ratio: z.number().nullable().optional(),
  enterprise_value_to_ebitda_ratio: z.number().nullable().optional(),
  free_cash_flow_yield: z.number().nullable().optional(),
  return_on_equity: z.number().nullable().optional(),
  net_margin: z.number().nullable().optional(),
  revenue_growth: z.number().nullable().optional(),
  earnings_growth: z.number().nullable().optional()
});

export const macroCardSchema = z.object({
  label: z.string(),
  ticker: z.string(),
  lastPrice: z.number(),
  changePct30d: z.number().nullable()
});

export const earningsCalendarSchema = z.object({
  ticker: z.string(),
  nextEarningsDate: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  sources: z.array(z.string())
});

export const sentimentPointSchema = z.object({
  date: z.string(),
  score: z.number(),
  headlineCount: z.number()
});

export const newsSentimentSchema = z.object({
  ticker: z.string(),
  windowDays: z.number(),
  timeline: z.array(sentimentPointSchema),
  topHeadlines: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      sentiment: z.enum(['positive', 'neutral', 'negative'])
    })
  )
});

export const optionsActivitySchema = z.object({
  ticker: z.string(),
  signal: z.enum(['bullish', 'neutral', 'bearish']),
  callPutRatio: z.number().nullable(),
  highlights: z.array(z.string()),
  sourceCount: z.number(),
  sources: z.array(z.string())
});

export const filingChangeItemSchema = z.object({
  filingType: z.string(),
  filingDate: z.string().nullable(),
  summary: z.string()
});

export const filingChangesSchema = z.object({
  ticker: z.string(),
  latestFilingType: z.string().nullable(),
  latestFilingDate: z.string().nullable(),
  riskLevel: z.enum(['low', 'medium', 'high']),
  changes: z.array(filingChangeItemSchema),
  sources: z.array(z.string())
});

export const transcriptQaItemSchema = z.object({
  question: z.string(),
  answerSummary: z.string(),
  sentiment: z.enum(['positive', 'neutral', 'negative'])
});

export const transcriptQASchema = z.object({
  ticker: z.string(),
  asOf: z.string(),
  items: z.array(transcriptQaItemSchema),
  sources: z.array(z.string())
});

export const ownershipTrendSchema = z.object({
  ticker: z.string(),
  institutionalTrend: z.enum(['increasing', 'flat', 'decreasing']),
  insiderTrend: z.enum(['buying', 'neutral', 'selling']),
  highlights: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
  sources: z.array(z.string())
});

export const multiAgentStepSchema = z.object({
  agent: z.enum(['planner', 'collector', 'critic']),
  status: z.enum(['completed', 'warning']),
  summary: z.string()
});

export const sourceConfidenceSchema = z.object({
  url: z.string(),
  domain: z.string(),
  score: z.number(),
  badge: z.enum(['high', 'medium', 'low'])
});

export const contradictionCheckSchema = z.object({
  status: z.enum(['clear', 'warning']),
  findings: z.array(z.string())
});

export const stressScenarioSchema = z.object({
  name: z.string(),
  assumption: z.string(),
  impact: z.string(),
  likelihood: z.enum(['low', 'medium', 'high'])
});

export const assumptionStressSchema = z.object({
  baseCase: z.string(),
  scenarios: z.array(stressScenarioSchema)
});

export const thesisMemorySchema = z.object({
  sessionId: z.string(),
  evolution: z.array(
    z.object({
      timestamp: z.string(),
      thesis: z.string()
    })
  )
});

export const timelineEventSchema = z.object({
  step: z.string(),
  timestamp: z.string(),
  durationMs: z.number().nullable(),
  detail: z.string().optional()
});

export const queryUsageSchema = z.object({
  tokenCount: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  estimatedCost: z.number(),
  costBreakdown: z.object({
    openrouter: z.number(),
    financial: z.number(),
    exa: z.number()
  })
});

export const queryArtifactSchema = z.object({
  structuredBrief: z
    .object({
      mode: queryModeSchema,
      tickers: z.array(z.string()),
      sections: z.array(
        z.object({
          title: z.string(),
          bullets: z.array(z.string())
        })
      ),
      followUps: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            prompt: z.string(),
            mode: queryModeSchema,
            verbosity: queryVerbositySchema
          })
        )
        .optional(),
      createdAt: z.string()
    })
    .optional(),
  sources: z.array(z.string()).optional(),
  toolCalls: z
    .array(
      z.object({
        tool: z.string(),
        args: z.record(z.unknown()),
        result: z.string()
      })
    )
    .optional(),
  priceChart: priceChartSchema.optional(),
  priceCharts: z.array(priceChartSchema).optional(),
  metricSnapshot: metricSnapshotSchema.optional(),
  comparisonTable: comparisonTableSchema.optional(),
  macroCards: z.array(macroCardSchema).optional(),
  earningsCalendar: earningsCalendarSchema.optional(),
  newsSentiment: newsSentimentSchema.optional(),
  optionsActivity: optionsActivitySchema.optional(),
  filingChanges: filingChangesSchema.optional(),
  transcriptQA: transcriptQASchema.optional(),
  ownershipTrend: ownershipTrendSchema.optional(),
  multiAgentTrace: z.array(multiAgentStepSchema).optional(),
  sourceConfidence: z.array(sourceConfidenceSchema).optional(),
  contradictionCheck: contradictionCheckSchema.optional(),
  assumptionStress: assumptionStressSchema.optional(),
  thesisMemory: thesisMemorySchema.optional(),
  timeline: z.array(timelineEventSchema).optional()
});

export const queryRecordSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  userId: z.string(),
  question: z.string(),
  response: z.string().nullable(),
  status: queryStatusSchema,
  error: z.string().nullable(),
  provider: z.string(),
  model: z.string(),
  usage: queryUsageSchema.optional(),
  artifacts: queryArtifactSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const registerInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(80),
  password: z.string().min(8).max(128)
});

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
});

export const createSessionInputSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional()
});

export const watchlistItemSchema = z.object({
  ticker: z.string().min(1).max(10),
  note: z.string().max(500).nullable(),
  targetPrice: z.number().positive().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const watchlistSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string().min(1).max(120),
  items: z.array(watchlistItemSchema),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const createWatchlistInputSchema = z.object({
  name: z.string().min(1).max(120)
});

export const upsertWatchlistItemInputSchema = z.object({
  ticker: z.string().min(1).max(10),
  note: z.string().max(500).optional(),
  targetPrice: z.number().positive().optional()
});

export const providerStatusSchema = z.object({
  configured: z.boolean(),
  reachable: z.boolean(),
  latencyMs: z.number().nullable(),
  error: z.string().nullable()
});

export const providerDiagnosticsSchema = z.object({
  timestamp: z.string(),
  mode: z.string(),
  providers: z.object({
    openrouter: providerStatusSchema,
    financialDatasets: providerStatusSchema,
    exasearch: providerStatusSchema
  }),
  history: z
    .object({
      openrouter: z.array(providerStatusSchema),
      financialDatasets: z.array(providerStatusSchema),
      exasearch: z.array(providerStatusSchema)
    })
    .optional()
});

export const secretValidationItemSchema = z.object({
  key: z.string(),
  required: z.boolean(),
  status: z.enum(['valid', 'missing', 'invalid']),
  message: z.string()
});

export const secretValidationSchema = z.object({
  criticalReady: z.boolean(),
  checkedAt: z.string(),
  items: z.array(secretValidationItemSchema)
});

export const budgetSettingsSchema = z.object({
  dailyBudgetCap: z.number().positive(),
  monthlyBudgetCap: z.number().positive(),
  perSessionCap: z.number().positive(),
  perQueryCap: z.number().positive()
});

export const budgetSnapshotSchema = z.object({
  settings: budgetSettingsSchema,
  spent: z.object({
    daily: z.number(),
    monthly: z.number(),
    session: z.number().nullable()
  }),
  remaining: z.object({
    daily: z.number(),
    monthly: z.number(),
    session: z.number().nullable(),
    perQuery: z.number()
  }),
  asOf: z.string()
});

export const executeQueryInputSchema = z.object({
  sessionId: z.string().min(1),
  query: z.string().min(1).max(8000),
  mode: queryModeSchema.optional(),
  verbosity: queryVerbositySchema.optional()
});

export type User = z.infer<typeof userSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type QueryRecord = z.infer<typeof queryRecordSchema>;
export type QueryStatus = z.infer<typeof queryStatusSchema>;
export type QueryArtifacts = z.infer<typeof queryArtifactSchema>;
export type QueryUsage = z.infer<typeof queryUsageSchema>;
export type Watchlist = z.infer<typeof watchlistSchema>;
export type WatchlistItem = z.infer<typeof watchlistItemSchema>;
export type ProviderDiagnostics = z.infer<typeof providerDiagnosticsSchema>;
export type SecretValidation = z.infer<typeof secretValidationSchema>;
export type BudgetSettings = z.infer<typeof budgetSettingsSchema>;
export type BudgetSnapshot = z.infer<typeof budgetSnapshotSchema>;

export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;
export type CreateWatchlistInput = z.infer<typeof createWatchlistInputSchema>;
export type UpsertWatchlistItemInput = z.infer<typeof upsertWatchlistItemInputSchema>;
export type ExecuteQueryInput = z.infer<typeof executeQueryInputSchema>;

export function buildAppBanner(name: string): string {
  return `${name} ready`;
}
