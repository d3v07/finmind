import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { QueryRecord, Session } from '@finmind/shared';
import type { Repository } from '../repositories/types.js';

type ViewPreset = {
  id: string;
  userId: string;
  sessionId: string;
  name: string;
  mode: 'guided' | 'advanced';
  workflowId: string;
  verbosity: 'short' | 'standard' | 'deep';
  createdAt: string;
  updatedAt: string;
};

type PortfolioPosition = {
  id: string;
  ticker: string;
  shares: number;
  costBasis: number;
  sector: string;
};

type Portfolio = {
  id: string;
  userId: string;
  name: string;
  source: 'csv' | 'alpaca' | 'ibkr' | 'manual';
  positions: PortfolioPosition[];
  createdAt: string;
  updatedAt: string;
};

type AlertRule = {
  id: string;
  userId: string;
  ticker: string;
  kind: 'price' | 'earnings' | 'event' | 'scenario';
  operator: '>' | '>=' | '<' | '<=' | '==';
  threshold: number;
  metric: string;
  status: 'active' | 'paused';
  createdAt: string;
  updatedAt: string;
};

type JournalEntry = {
  id: string;
  userId: string;
  sessionId: string;
  title: string;
  thesis: string;
  outcome: string | null;
  postMortem: string | null;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceMember = {
  userEmail: string;
  role: 'owner' | 'editor' | 'viewer' | 'approver';
  addedAt: string;
};

type Workspace = {
  id: string;
  userId: string;
  name: string;
  members: WorkspaceMember[];
  createdAt: string;
  updatedAt: string;
};

type CommentEntry = {
  id: string;
  userId: string;
  targetType: 'query' | 'report' | 'chart';
  targetId: string;
  body: string;
  createdAt: string;
};

type ApprovalRequest = {
  id: string;
  userId: string;
  targetType: 'report' | 'note';
  targetId: string;
  requestedFrom: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ShareLink = {
  id: string;
  userId: string;
  targetType: 'report' | 'session';
  targetId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
};

type DistributionLog = {
  id: string;
  userId: string;
  channel: 'slack' | 'discord' | 'email';
  target: string;
  targetType: 'report' | 'session';
  targetId: string;
  status: 'sent' | 'failed';
  createdAt: string;
};

type WebhookEndpoint = {
  id: string;
  userId: string;
  name: string;
  url: string;
  secret: string | null;
  status: 'active' | 'paused';
  createdAt: string;
  updatedAt: string;
};

type WeeklyBrief = {
  id: string;
  userId: string;
  weekStart: string;
  content: string;
  createdAt: string;
};

type EnterpriseSettings = {
  sso: {
    googleEnabled: boolean;
    microsoftEnabled: boolean;
    oktaEnabled: boolean;
    oktaDomain: string | null;
  };
  billing: {
    monthlyQuota: number;
    teamBudgetCap: number;
  };
  compliance: {
    piiRedaction: boolean;
    retentionDays: number;
  };
  branding: {
    themeName: string;
    primaryColor: string;
    secondaryColor: string;
    customDomain: string | null;
  };
};

type EnterpriseSettingsPatch = {
  sso?: Partial<EnterpriseSettings['sso']>;
  billing?: Partial<EnterpriseSettings['billing']>;
  compliance?: Partial<EnterpriseSettings['compliance']>;
  branding?: Partial<EnterpriseSettings['branding']>;
};

type FeatureState = {
  viewPresets: ViewPreset[];
  portfolios: Portfolio[];
  alerts: AlertRule[];
  journalEntries: JournalEntry[];
  workspaces: Workspace[];
  comments: CommentEntry[];
  approvals: ApprovalRequest[];
  shareLinks: ShareLink[];
  distributionLogs: DistributionLog[];
  webhooks: WebhookEndpoint[];
  weeklyBriefs: WeeklyBrief[];
  enterpriseByUser: Record<string, EnterpriseSettings>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function defaultEnterpriseSettings(): EnterpriseSettings {
  return {
    sso: {
      googleEnabled: false,
      microsoftEnabled: false,
      oktaEnabled: false,
      oktaDomain: null
    },
    billing: {
      monthlyQuota: 1500,
      teamBudgetCap: 5000
    },
    compliance: {
      piiRedaction: false,
      retentionDays: 365
    },
    branding: {
      themeName: 'finmind-default',
      primaryColor: '#0d7a6d',
      secondaryColor: '#13222f',
      customDomain: null
    }
  };
}

function emptyFeatureState(): FeatureState {
  return {
    viewPresets: [],
    portfolios: [],
    alerts: [],
    journalEntries: [],
    workspaces: [],
    comments: [],
    approvals: [],
    shareLinks: [],
    distributionLogs: [],
    webhooks: [],
    weeklyBriefs: [],
    enterpriseByUser: {}
  };
}

function parseNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inferSector(ticker: string): string {
  const value = ticker.toUpperCase();
  if (['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMD', 'TSM'].includes(value)) {
    return 'Technology';
  }
  if (['JPM', 'BAC', 'WFC', 'GS', 'MS'].includes(value)) {
    return 'Financials';
  }
  if (['XOM', 'CVX', 'COP', 'SLB'].includes(value)) {
    return 'Energy';
  }
  if (['UNH', 'JNJ', 'PFE', 'MRK', 'LLY'].includes(value)) {
    return 'Healthcare';
  }
  if (['AMZN', 'WMT', 'COST', 'HD'].includes(value)) {
    return 'Consumer';
  }
  return 'Other';
}

function parsePortfolioCsv(csv: string): PortfolioPosition[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }

  const headers = lines[0].split(',').map((item) => item.trim().toLowerCase());
  const tickerIndex = headers.findIndex((item) => item === 'ticker' || item === 'symbol');
  const sharesIndex = headers.findIndex((item) => item === 'shares' || item === 'quantity');
  const costBasisIndex = headers.findIndex((item) => item === 'costbasis' || item === 'cost_basis' || item === 'cost');
  const sectorIndex = headers.findIndex((item) => item === 'sector');

  const dataLines = tickerIndex >= 0 ? lines.slice(1) : lines;

  return dataLines
    .map((line) => {
      const cells = line.split(',').map((item) => item.trim());
      const ticker = (tickerIndex >= 0 ? cells[tickerIndex] : cells[0] ?? '').toUpperCase();
      const shares = parseNumber(sharesIndex >= 0 ? cells[sharesIndex] ?? '0' : cells[1] ?? '0', 0);
      const costBasis = parseNumber(
        costBasisIndex >= 0 ? cells[costBasisIndex] ?? '0' : cells[2] ?? '0',
        0
      );
      const sector = sectorIndex >= 0 ? cells[sectorIndex] ?? inferSector(ticker) : inferSector(ticker);

      if (!ticker || shares <= 0) {
        return null;
      }

      return {
        id: randomUUID(),
        ticker,
        shares,
        costBasis,
        sector: sector || 'Other'
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function compareNumeric(left: number, right: number, operator: AlertRule['operator']): boolean {
  if (operator === '>') {
    return left > right;
  }
  if (operator === '>=') {
    return left >= right;
  }
  if (operator === '<') {
    return left < right;
  }
  if (operator === '<=') {
    return left <= right;
  }
  return left === right;
}

function getWeekStart(date: Date): string {
  const normalized = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = normalized.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  normalized.setUTCDate(normalized.getUTCDate() + diff);
  return normalized.toISOString().slice(0, 10);
}

function redactPii(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[REDACTED_PHONE]');
}

export class FeatureService {
  private readonly filePath: string;
  private state: FeatureState;

  constructor(
    private readonly repository: Repository,
    filePath = process.env.FINMIND_FEATURE_FILE ?? '.finmind/feature-hub.json'
  ) {
    this.filePath = filePath;
    this.state = this.loadState();
  }

  getGuidedPresets() {
    return [
      { id: 'swing_trade', title: 'Swing Trade Setup', mode: 'guided' as const },
      { id: 'earnings_trade', title: 'Earnings Trade Plan', mode: 'guided' as const },
      { id: 'pair_trade', title: 'Pair Trade Evaluation', mode: 'guided' as const },
      { id: 'momentum_breakout', title: 'Momentum Breakout', mode: 'guided' as const },
      { id: 'mean_reversion', title: 'Mean Reversion', mode: 'guided' as const },
      { id: 'macro_rotation', title: 'Macro Rotation', mode: 'guided' as const }
    ];
  }

  listViewPresets(userId: string, sessionId?: string) {
    return this.state.viewPresets.filter(
      (item) => item.userId === userId && (!sessionId || item.sessionId === sessionId)
    );
  }

  saveViewPreset(
    userId: string,
    input: {
      sessionId: string;
      name: string;
      mode: 'guided' | 'advanced';
      workflowId: string;
      verbosity: 'short' | 'standard' | 'deep';
    }
  ) {
    const now = nowIso();
    const preset: ViewPreset = {
      id: randomUUID(),
      userId,
      sessionId: input.sessionId,
      name: input.name,
      mode: input.mode,
      workflowId: input.workflowId,
      verbosity: input.verbosity,
      createdAt: now,
      updatedAt: now
    };

    this.state.viewPresets.unshift(preset);
    this.persist();
    return preset;
  }

  composeReport(userId: string, sessionId: string) {
    const session = this.repository.getSessionById(sessionId);
    if (!session || session.userId !== userId) {
      throw new Error('Session not found');
    }

    const queries = this.repository.getQueriesBySessionId(sessionId).filter((item) => item.status === 'completed');
    const responseBlocks = queries.slice(-8).map((item, index) => {
      const text = (item.response ?? item.error ?? '').replace(/\s+/g, ' ').trim();
      const clipped = text.length > 380 ? `${text.slice(0, 377)}...` : text;
      return `### Finding ${index + 1}\n- Question: ${item.question}\n- Insight: ${clipped || 'No output'}`;
    });

    const report = [
      '# Investment Memo',
      '',
      `Session: ${session.title}`,
      `Generated: ${nowIso()}`,
      '',
      '## Executive Summary',
      `Compiled from ${queries.length} completed research runs.`,
      '',
      '## Key Findings',
      ...(responseBlocks.length > 0 ? responseBlocks : ['No completed findings available yet.']),
      '',
      '## Risk Notes',
      '- Validate catalyst timelines before execution.',
      '- Confirm liquidity and position sizing constraints.',
      '',
      '## Decision',
      'Use this memo as a draft and finalize with current market data checks.'
    ].join('\n');

    return {
      sessionId,
      report
    };
  }

  importPortfolio(
    userId: string,
    input: {
      name: string;
      source: 'csv' | 'alpaca' | 'ibkr' | 'manual';
      csv: string;
    }
  ) {
    const positions = parsePortfolioCsv(input.csv);
    const now = nowIso();
    const portfolio: Portfolio = {
      id: randomUUID(),
      userId,
      name: input.name,
      source: input.source,
      positions,
      createdAt: now,
      updatedAt: now
    };

    this.state.portfolios.unshift(portfolio);
    this.persist();
    return portfolio;
  }

  listPortfolios(userId: string) {
    return this.state.portfolios.filter((item) => item.userId === userId);
  }

  getPortfolioInsights(userId: string, portfolioId: string) {
    const portfolio = this.state.portfolios.find((item) => item.id === portfolioId && item.userId === userId);
    if (!portfolio) {
      throw new Error('Portfolio not found');
    }

    const valued = portfolio.positions.map((item) => ({
      ...item,
      marketValue: Number((item.shares * (item.costBasis || 1)).toFixed(2))
    }));
    const totalValue = valued.reduce((sum, item) => sum + item.marketValue, 0);

    const sectorWeights = new Map<string, number>();
    for (const row of valued) {
      const previous = sectorWeights.get(row.sector) ?? 0;
      sectorWeights.set(row.sector, previous + row.marketValue);
    }

    const concentration = valued
      .map((item) => ({
        ticker: item.ticker,
        weight: totalValue > 0 ? Number(((item.marketValue / totalValue) * 100).toFixed(2)) : 0
      }))
      .sort((left, right) => right.weight - left.weight)
      .slice(0, 10);

    const factorExposure = {
      value: Number(
        (
          concentration.reduce((sum, item) => sum + (item.ticker.charCodeAt(0) % 11), 0) /
          Math.max(1, concentration.length)
        ).toFixed(2)
      ),
      growth: Number(
        (
          concentration.reduce((sum, item) => sum + (item.ticker.charCodeAt(item.ticker.length - 1) % 11), 0) /
          Math.max(1, concentration.length)
        ).toFixed(2)
      ),
      quality: Number((5 + Math.min(4, concentration.length / 2)).toFixed(2)),
      momentum: Number((4 + (totalValue % 6)).toFixed(2))
    };

    const sectorHeatmap = [...sectorWeights.entries()].map(([sector, value]) => ({
      sector,
      weightPct: totalValue > 0 ? Number(((value / totalValue) * 100).toFixed(2)) : 0
    }));

    const targetWeight = concentration.length > 0 ? 100 / concentration.length : 0;
    const rebalanceSuggestions = concentration.map((item) => ({
      ticker: item.ticker,
      currentWeight: item.weight,
      targetWeight: Number(targetWeight.toFixed(2)),
      action:
        item.weight > targetWeight + 3
          ? ('trim' as const)
          : item.weight < targetWeight - 3
            ? ('add' as const)
            : ('hold' as const)
    }));

    return {
      portfolioId,
      totalValue: Number(totalValue.toFixed(2)),
      concentration,
      factorExposure,
      sectorHeatmap,
      rebalanceSuggestions
    };
  }

  calculatePositionSize(input: {
    portfolioValue: number;
    riskPct: number;
    entryPrice: number;
    stopPrice: number;
  }) {
    const riskDollars = Math.max(0, input.portfolioValue * (input.riskPct / 100));
    const perShareRisk = Math.max(0.0001, Math.abs(input.entryPrice - input.stopPrice));
    const shares = Math.floor(riskDollars / perShareRisk);
    const notional = Number((shares * input.entryPrice).toFixed(2));

    return {
      riskDollars: Number(riskDollars.toFixed(2)),
      perShareRisk: Number(perShareRisk.toFixed(4)),
      shares,
      notional
    };
  }

  createAlert(
    userId: string,
    input: {
      ticker: string;
      kind: AlertRule['kind'];
      operator: AlertRule['operator'];
      threshold: number;
      metric: string;
    }
  ) {
    const now = nowIso();
    const alert: AlertRule = {
      id: randomUUID(),
      userId,
      ticker: input.ticker.toUpperCase(),
      kind: input.kind,
      operator: input.operator,
      threshold: input.threshold,
      metric: input.metric,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    this.state.alerts.unshift(alert);
    this.persist();
    return alert;
  }

  listAlerts(userId: string) {
    return this.state.alerts.filter((item) => item.userId === userId);
  }

  evaluateAlerts(
    userId: string,
    input?: {
      prices?: Record<string, number>;
      metrics?: Record<string, number>;
    }
  ) {
    const prices = input?.prices ?? {};
    const metrics = input?.metrics ?? {};

    const active = this.state.alerts.filter((item) => item.userId === userId && item.status === 'active');
    return active.map((item) => {
      const metricKey = `${item.ticker}:${item.metric}`;
      const value =
        item.kind === 'price'
          ? prices[item.ticker] ?? metrics[item.metric] ?? 0
          : metrics[metricKey] ?? metrics[item.metric] ?? 0;
      return {
        alertId: item.id,
        ticker: item.ticker,
        triggered: compareNumeric(value, item.threshold, item.operator),
        observedValue: value
      };
    });
  }

  createJournalEntry(
    userId: string,
    input: {
      sessionId: string;
      title: string;
      thesis: string;
      outcome?: string;
      postMortem?: string;
    }
  ) {
    const now = nowIso();
    const entry: JournalEntry = {
      id: randomUUID(),
      userId,
      sessionId: input.sessionId,
      title: input.title,
      thesis: input.thesis,
      outcome: input.outcome ?? null,
      postMortem: input.postMortem ?? null,
      createdAt: now,
      updatedAt: now
    };
    this.state.journalEntries.unshift(entry);
    this.persist();
    return entry;
  }

  listJournalEntries(userId: string, sessionId?: string) {
    return this.state.journalEntries.filter(
      (item) => item.userId === userId && (!sessionId || item.sessionId === sessionId)
    );
  }

  createWorkspace(userId: string, input: { name: string; ownerEmail: string }) {
    const now = nowIso();
    const workspace: Workspace = {
      id: randomUUID(),
      userId,
      name: input.name,
      members: [
        {
          userEmail: input.ownerEmail,
          role: 'owner',
          addedAt: now
        }
      ],
      createdAt: now,
      updatedAt: now
    };
    this.state.workspaces.unshift(workspace);
    this.persist();
    return workspace;
  }

  listWorkspaces(userId: string) {
    return this.state.workspaces.filter((item) => item.userId === userId);
  }

  addWorkspaceMember(
    userId: string,
    workspaceId: string,
    input: { userEmail: string; role: WorkspaceMember['role'] }
  ) {
    const workspace = this.state.workspaces.find((item) => item.id === workspaceId && item.userId === userId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    workspace.members.push({
      userEmail: input.userEmail.toLowerCase(),
      role: input.role,
      addedAt: nowIso()
    });
    workspace.updatedAt = nowIso();
    this.persist();
    return workspace;
  }

  createComment(
    userId: string,
    input: {
      targetType: CommentEntry['targetType'];
      targetId: string;
      body: string;
    }
  ) {
    const comment: CommentEntry = {
      id: randomUUID(),
      userId,
      targetType: input.targetType,
      targetId: input.targetId,
      body: input.body,
      createdAt: nowIso()
    };
    this.state.comments.unshift(comment);
    this.persist();
    return comment;
  }

  listComments(
    userId: string,
    input?: {
      targetType?: CommentEntry['targetType'];
      targetId?: string;
    }
  ) {
    return this.state.comments.filter(
      (item) =>
        item.userId === userId &&
        (!input?.targetType || item.targetType === input.targetType) &&
        (!input?.targetId || item.targetId === input.targetId)
    );
  }

  createApproval(
    userId: string,
    input: {
      targetType: ApprovalRequest['targetType'];
      targetId: string;
      requestedFrom: string;
    }
  ) {
    const now = nowIso();
    const approval: ApprovalRequest = {
      id: randomUUID(),
      userId,
      targetType: input.targetType,
      targetId: input.targetId,
      requestedFrom: input.requestedFrom,
      status: 'pending',
      decidedBy: null,
      decidedAt: null,
      createdAt: now,
      updatedAt: now
    };
    this.state.approvals.unshift(approval);
    this.persist();
    return approval;
  }

  listApprovals(userId: string) {
    return this.state.approvals.filter((item) => item.userId === userId);
  }

  decideApproval(
    userId: string,
    approvalId: string,
    input: { status: 'approved' | 'rejected'; decidedBy: string }
  ) {
    const approval = this.state.approvals.find((item) => item.id === approvalId && item.userId === userId);
    if (!approval) {
      throw new Error('Approval request not found');
    }

    approval.status = input.status;
    approval.decidedBy = input.decidedBy;
    approval.decidedAt = nowIso();
    approval.updatedAt = nowIso();
    this.persist();
    return approval;
  }

  createShareLink(
    userId: string,
    input: {
      targetType: ShareLink['targetType'];
      targetId: string;
      expiresInHours: number;
    }
  ) {
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + Math.max(1, input.expiresInHours) * 3600 * 1000).toISOString();
    const link: ShareLink = {
      id: randomUUID(),
      userId,
      targetType: input.targetType,
      targetId: input.targetId,
      token: randomUUID().replace(/-/g, ''),
      expiresAt,
      createdAt
    };
    this.state.shareLinks.unshift(link);
    this.persist();
    return link;
  }

  listShareLinks(userId: string) {
    return this.state.shareLinks.filter((item) => item.userId === userId);
  }

  distributeReport(
    userId: string,
    input: {
      channel: DistributionLog['channel'];
      target: string;
      targetType: DistributionLog['targetType'];
      targetId: string;
    }
  ) {
    const log: DistributionLog = {
      id: randomUUID(),
      userId,
      channel: input.channel,
      target: input.target,
      targetType: input.targetType,
      targetId: input.targetId,
      status: 'sent',
      createdAt: nowIso()
    };
    this.state.distributionLogs.unshift(log);
    this.persist();
    return log;
  }

  listDistributionLogs(userId: string) {
    return this.state.distributionLogs.filter((item) => item.userId === userId);
  }

  registerWebhook(
    userId: string,
    input: {
      name: string;
      url: string;
      secret?: string;
    }
  ) {
    const now = nowIso();
    const endpoint: WebhookEndpoint = {
      id: randomUUID(),
      userId,
      name: input.name,
      url: input.url,
      secret: input.secret ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    this.state.webhooks.unshift(endpoint);
    this.persist();
    return endpoint;
  }

  listWebhooks(userId: string) {
    return this.state.webhooks.filter((item) => item.userId === userId);
  }

  testWebhook(userId: string, webhookId: string) {
    const endpoint = this.state.webhooks.find((item) => item.id === webhookId && item.userId === userId);
    if (!endpoint) {
      throw new Error('Webhook not found');
    }

    return {
      webhookId,
      status: endpoint.status === 'active' ? 'simulated_delivery_success' : 'webhook_paused',
      testedAt: nowIso()
    };
  }

  getEnterpriseSettings(userId: string) {
    return this.ensureEnterprise(userId);
  }

  updateEnterpriseSettings(userId: string, patch: EnterpriseSettingsPatch) {
    const current = this.ensureEnterprise(userId);
    const next: EnterpriseSettings = {
      sso: {
        ...current.sso,
        ...(patch.sso ?? {})
      },
      billing: {
        ...current.billing,
        ...(patch.billing ?? {})
      },
      compliance: {
        ...current.compliance,
        ...(patch.compliance ?? {})
      },
      branding: {
        ...current.branding,
        ...(patch.branding ?? {})
      }
    };

    this.state.enterpriseByUser[userId] = next;
    this.persist();
    return next;
  }

  getSsoLaunchUrl(userId: string, provider: 'google' | 'microsoft' | 'okta') {
    const settings = this.ensureEnterprise(userId);
    const enabled =
      provider === 'google'
        ? settings.sso.googleEnabled
        : provider === 'microsoft'
          ? settings.sso.microsoftEnabled
          : settings.sso.oktaEnabled;
    const base =
      provider === 'okta'
        ? settings.sso.oktaDomain
          ? `https://${settings.sso.oktaDomain}/oauth2/v1/authorize`
          : null
        : `https://auth.${provider}.example.com/oauth2/authorize`;

    return {
      provider,
      enabled,
      url: enabled && base ? `${base}?client_id=finmind-web&scope=openid%20profile%20email` : null
    };
  }

  getBillingOverview(userId: string) {
    const settings = this.ensureEnterprise(userId);
    const month = nowIso().slice(0, 7);
    const usage = this.repository
      .getQueriesByUserId(userId)
      .filter((item) => item.createdAt.slice(0, 7) === month)
      .reduce((sum, item) => sum + (item.usage?.estimatedCost ?? 0), 0);

    return {
      month,
      usage: Number(usage.toFixed(2)),
      monthlyQuota: settings.billing.monthlyQuota,
      remaining: Number((settings.billing.monthlyQuota - usage).toFixed(2)),
      teamBudgetCap: settings.billing.teamBudgetCap
    };
  }

  getComplianceControls(userId: string) {
    return this.ensureEnterprise(userId).compliance;
  }

  updateComplianceControls(
    userId: string,
    patch: Partial<EnterpriseSettings['compliance']>
  ) {
    return this.updateEnterpriseSettings(userId, {
      compliance: patch
    }).compliance;
  }

  previewRedaction(userId: string, text: string) {
    const controls = this.getComplianceControls(userId);
    if (!controls.piiRedaction) {
      return {
        enabled: false,
        original: text,
        redacted: text
      };
    }

    return {
      enabled: true,
      original: text,
      redacted: redactPii(text)
    };
  }

  runRetentionSweep(userId: string) {
    const controls = this.getComplianceControls(userId);
    const cutoffDate = new Date(Date.now() - controls.retentionDays * 24 * 60 * 60 * 1000);
    const affectedQueries = this.repository
      .getQueriesByUserId(userId)
      .filter((item) => new Date(item.createdAt).getTime() < cutoffDate.getTime()).length;

    return {
      retentionDays: controls.retentionDays,
      cutoff: cutoffDate.toISOString(),
      candidateQueryCount: affectedQueries,
      note: 'Preview only in file-repository mode. Wire delete support for hard retention.'
    };
  }

  generateWeeklyBrief(userId: string, weekStart?: string) {
    const targetWeekStart = weekStart ?? getWeekStart(new Date());
    const weekStartDate = new Date(`${targetWeekStart}T00:00:00.000Z`);
    const weekEndDate = new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    const sessions = this.repository.getSessionsByUserId(userId);
    const queries = this.repository
      .getQueriesByUserId(userId)
      .filter((item) => {
        const at = new Date(item.createdAt).getTime();
        return at >= weekStartDate.getTime() && at < weekEndDate.getTime();
      });

    const totalCost = queries.reduce((sum, item) => sum + (item.usage?.estimatedCost ?? 0), 0);
    const completed = queries.filter((item) => item.status === 'completed').length;
    const failed = queries.filter((item) => item.status === 'failed').length;

    const topQuestions = queries.slice(-5).map((item) => `- ${item.question}`);
    const content = [
      `# Weekly Brief (${targetWeekStart})`,
      '',
      `Sessions active: ${sessions.length}`,
      `Queries run: ${queries.length}`,
      `Completed: ${completed}, Failed: ${failed}`,
      `Estimated usage cost: $${totalCost.toFixed(2)}`,
      '',
      '## Top Research Prompts',
      ...(topQuestions.length > 0 ? topQuestions : ['- No queries this week']),
      '',
      '## Suggested Next Actions',
      '- Review open risks and contradiction warnings in recent advanced analyses.',
      '- Update portfolio alerts for upcoming earnings/events.',
      '- Export session memo for stakeholder review.'
    ].join('\n');

    const brief: WeeklyBrief = {
      id: randomUUID(),
      userId,
      weekStart: targetWeekStart,
      content,
      createdAt: nowIso()
    };

    this.state.weeklyBriefs.unshift(brief);
    this.persist();
    return brief;
  }

  listWeeklyBriefs(userId: string) {
    return this.state.weeklyBriefs.filter((item) => item.userId === userId);
  }

  private ensureEnterprise(userId: string): EnterpriseSettings {
    const existing = this.state.enterpriseByUser[userId];
    if (existing) {
      return existing;
    }

    const created = defaultEnterpriseSettings();
    this.state.enterpriseByUser[userId] = created;
    this.persist();
    return created;
  }

  private loadState(): FeatureState {
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as FeatureState;
      return {
        ...emptyFeatureState(),
        ...parsed,
        enterpriseByUser: parsed.enterpriseByUser ?? {}
      };
    } catch {
      return emptyFeatureState();
    }
  }

  private persist() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  // Utility to support feature 50 (white-label theme) from frontend.
  getBranding(userId: string) {
    return this.ensureEnterprise(userId).branding;
  }

  // Utility to support feature 34 and 46 summaries.
  summarizeSessionMemory(userId: string, sessionId: string) {
    const session = this.repository.getSessionById(sessionId);
    if (!session || session.userId !== userId) {
      throw new Error('Session not found');
    }
    const queries = this.repository.getQueriesBySessionId(sessionId).slice(-10);
    return {
      sessionId,
      summary: this.buildMemorySummary(session, queries)
    };
  }

  private buildMemorySummary(session: Session, queries: QueryRecord[]) {
    const lines = queries.map((item) => {
      const output = (item.response ?? item.error ?? '').replace(/\s+/g, ' ').trim();
      const compact = output.length > 180 ? `${output.slice(0, 177)}...` : output;
      return `- ${item.createdAt.slice(0, 10)}: ${compact || item.question}`;
    });

    return [`Session memory for "${session.title}"`, ...lines].join('\n');
  }
}
