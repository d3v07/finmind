import { useCallback, useEffect, useMemo, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

type FeatureLabProps = {
  token: string;
  activeSessionId: string | null;
  latestQueryId: string | null;
  onApplyPreset: (presetId: string) => void;
};

type PaletteCommand = {
  id: string;
  label: string;
  run: () => Promise<void> | void;
};

class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function apiRequest<T>(
  path: string,
  method: 'GET' | 'POST',
  token: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(text || `Request failed (${response.status})`, response.status);
  }

  return (await response.json()) as T;
}

function parseJsonRecord(input: string): Record<string, number> {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        result[key] = numeric;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function FeatureLab(props: FeatureLabProps) {
  const { token, activeSessionId, latestQueryId, onApplyPreset } = props;

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const [workflowPresets, setWorkflowPresets] = useState<Array<{ id: string; title: string }>>([]);
  const [viewPresets, setViewPresets] = useState<
    Array<{
      id: string;
      name: string;
      mode: 'guided' | 'advanced';
      workflowId: string;
      verbosity: 'short' | 'standard' | 'deep';
      sessionId: string;
    }>
  >([]);
  const [viewForm, setViewForm] = useState({
    name: '',
    mode: 'guided' as 'guided' | 'advanced',
    workflowId: 'earnings_snapshot',
    verbosity: 'standard' as 'short' | 'standard' | 'deep'
  });

  const [reportMarkdown, setReportMarkdown] = useState('');

  const [portfolioCsv, setPortfolioCsv] = useState('ticker,shares,costBasis,sector\nAAPL,10,185,Technology');
  const [portfolioName, setPortfolioName] = useState('Main Portfolio');
  const [portfolios, setPortfolios] = useState<Array<{ id: string; name: string; positions: Array<{ id: string; ticker: string }> }>>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>('');
  const [portfolioInsights, setPortfolioInsights] = useState<{
    totalValue: number;
    factorExposure: Record<string, number>;
    sectorHeatmap: Array<{ sector: string; weightPct: number }>;
    rebalanceSuggestions: Array<{ ticker: string; currentWeight: number; targetWeight: number; action: string }>;
  } | null>(null);

  const [positionSizingForm, setPositionSizingForm] = useState({
    portfolioValue: 100000,
    riskPct: 1,
    entryPrice: 100,
    stopPrice: 95
  });
  const [positionSizingResult, setPositionSizingResult] = useState<{
    riskDollars: number;
    perShareRisk: number;
    shares: number;
    notional: number;
  } | null>(null);

  const [alertForm, setAlertForm] = useState({
    ticker: 'AAPL',
    kind: 'price' as 'price' | 'earnings' | 'event' | 'scenario',
    operator: '>' as '>' | '>=' | '<' | '<=' | '==',
    threshold: 200,
    metric: 'lastPrice'
  });
  const [alerts, setAlerts] = useState<Array<{ id: string; ticker: string; kind: string; metric: string; threshold: number; operator: string }>>([]);
  const [alertEvalInput, setAlertEvalInput] = useState('{"AAPL": 205, "MSFT": 410}');
  const [alertEvaluations, setAlertEvaluations] = useState<Array<{ alertId: string; ticker: string; triggered: boolean; observedValue: number }>>([]);

  const [journalForm, setJournalForm] = useState({
    title: '',
    thesis: '',
    outcome: '',
    postMortem: ''
  });
  const [journalEntries, setJournalEntries] = useState<Array<{ id: string; title: string; thesis: string; outcome: string | null }>>([]);

  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string; members: Array<{ userEmail: string; role: string }> }>>([]);
  const [workspaceForm, setWorkspaceForm] = useState({ name: 'Research Team', ownerEmail: 'owner@example.com' });
  const [workspaceMemberForm, setWorkspaceMemberForm] = useState({
    workspaceId: '',
    userEmail: 'member@example.com',
    role: 'editor' as 'owner' | 'editor' | 'viewer' | 'approver'
  });

  const [commentForm, setCommentForm] = useState({
    targetType: 'query' as 'query' | 'report' | 'chart',
    targetId: '',
    body: ''
  });
  const [comments, setComments] = useState<Array<{ id: string; targetType: string; body: string; createdAt: string }>>([]);

  const [approvalForm, setApprovalForm] = useState({
    targetType: 'report' as 'report' | 'note',
    targetId: '',
    requestedFrom: 'approver@example.com'
  });
  const [approvals, setApprovals] = useState<Array<{ id: string; targetType: string; targetId: string; status: string; requestedFrom: string }>>([]);

  const [shareLinkForm, setShareLinkForm] = useState({
    targetType: 'session' as 'report' | 'session',
    targetId: '',
    expiresInHours: 24
  });
  const [shareLinks, setShareLinks] = useState<Array<{ id: string; targetType: string; targetId: string; token: string; expiresAt: string }>>([]);

  const [distributionForm, setDistributionForm] = useState({
    channel: 'email' as 'slack' | 'discord' | 'email',
    target: 'team@example.com',
    targetType: 'session' as 'report' | 'session',
    targetId: ''
  });
  const [distributionLogs, setDistributionLogs] = useState<
    Array<{ id: string; channel: string; target: string; targetType: string; createdAt: string }>
  >([]);

  const [webhookForm, setWebhookForm] = useState({
    name: 'Research Automation',
    url: 'https://example.com/webhook',
    secret: ''
  });
  const [webhooks, setWebhooks] = useState<Array<{ id: string; name: string; url: string; status: string }>>([]);

  const [enterpriseSettings, setEnterpriseSettings] = useState<{
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
  } | null>(null);
  const [billingOverview, setBillingOverview] = useState<{
    usage: number;
    remaining: number;
    monthlyQuota: number;
    teamBudgetCap: number;
    month: string;
  } | null>(null);
  const [ssoProvider, setSsoProvider] = useState<'google' | 'microsoft' | 'okta'>('google');
  const [ssoLaunch, setSsoLaunch] = useState<{ provider: string; enabled: boolean; url: string | null } | null>(null);

  const [redactionInput, setRedactionInput] = useState('Contact me at investor@example.com or +1 (555) 212-9000');
  const [redactionPreview, setRedactionPreview] = useState<{ redacted: string; enabled: boolean } | null>(null);
  const [retentionSweep, setRetentionSweep] = useState<{
    retentionDays: number;
    cutoff: string;
    candidateQueryCount: number;
    note: string;
  } | null>(null);

  const [weeklyBriefs, setWeeklyBriefs] = useState<Array<{ id: string; weekStart: string; content: string; createdAt: string }>>([]);
  const [sessionMemory, setSessionMemory] = useState<string>('');

  const runAction = useCallback(async (label: string, fn: () => Promise<void>) => {
    try {
      setBusy(true);
      setStatus(null);
      await fn();
      setStatus(`${label} completed`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  }, []);

  const loadWorkflowPresets = useCallback(async () => {
    const data = await apiRequest<Array<{ id: string; title: string }>>('/api/workflows/presets', 'GET', token);
    setWorkflowPresets(data);
  }, [token]);

  const loadViews = useCallback(async () => {
    const path = activeSessionId ? `/api/views?sessionId=${encodeURIComponent(activeSessionId)}` : '/api/views';
    const data = await apiRequest<
      Array<{
        id: string;
        name: string;
        mode: 'guided' | 'advanced';
        workflowId: string;
        verbosity: 'short' | 'standard' | 'deep';
        sessionId: string;
      }>
    >(path, 'GET', token);
    setViewPresets(data);
  }, [activeSessionId, token]);

  const composeReport = useCallback(async () => {
    if (!activeSessionId) {
      setStatus('Select a session to compose report');
      return;
    }

    await runAction('Report composer', async () => {
      const response = await apiRequest<{ report: string }>(
        '/api/reports/compose',
        'POST',
        token,
        { sessionId: activeSessionId }
      );
      setReportMarkdown(response.report);
    });
  }, [activeSessionId, runAction, token]);

  const generateWeeklyBrief = useCallback(async () => {
    await runAction('Weekly brief generation', async () => {
      await apiRequest('/api/weekly-brief/generate', 'POST', token, {});
      const briefs = await apiRequest<Array<{ id: string; weekStart: string; content: string; createdAt: string }>>(
        '/api/weekly-briefs',
        'GET',
        token
      );
      setWeeklyBriefs(briefs);
    });
  }, [runAction, token]);

  const loadPortfolioState = useCallback(async () => {
    const nextPortfolios = await apiRequest<
      Array<{ id: string; name: string; positions: Array<{ id: string; ticker: string }> }>
    >('/api/portfolio', 'GET', token);
    setPortfolios(nextPortfolios);

    if (nextPortfolios.length > 0 && !selectedPortfolioId) {
      setSelectedPortfolioId(nextPortfolios[0].id);
    }
  }, [selectedPortfolioId, token]);

  const loadAlertState = useCallback(async () => {
    const next = await apiRequest<
      Array<{ id: string; ticker: string; kind: string; metric: string; threshold: number; operator: string }>
    >('/api/alerts', 'GET', token);
    setAlerts(next);
  }, [token]);

  const loadJournalState = useCallback(async () => {
    const path = activeSessionId ? `/api/journal?sessionId=${encodeURIComponent(activeSessionId)}` : '/api/journal';
    const next = await apiRequest<Array<{ id: string; title: string; thesis: string; outcome: string | null }>>(
      path,
      'GET',
      token
    );
    setJournalEntries(next);
  }, [activeSessionId, token]);

  const loadCollaborationState = useCallback(async () => {
    const [workspaceData, approvalData, shareData, distributionData, webhookData] = await Promise.all([
      apiRequest<Array<{ id: string; name: string; members: Array<{ userEmail: string; role: string }> }>>(
        '/api/workspaces',
        'GET',
        token
      ),
      apiRequest<Array<{ id: string; targetType: string; targetId: string; status: string; requestedFrom: string }>>(
        '/api/approvals',
        'GET',
        token
      ),
      apiRequest<Array<{ id: string; targetType: string; targetId: string; token: string; expiresAt: string }>>(
        '/api/share-links',
        'GET',
        token
      ),
      apiRequest<Array<{ id: string; channel: string; target: string; targetType: string; createdAt: string }>>(
        '/api/distribution/logs',
        'GET',
        token
      ),
      apiRequest<Array<{ id: string; name: string; url: string; status: string }>>('/api/webhooks', 'GET', token)
    ]);
    setWorkspaces(workspaceData);
    setApprovals(approvalData);
    setShareLinks(shareData);
    setDistributionLogs(distributionData);
    setWebhooks(webhookData);
  }, [token]);

  const loadEnterpriseState = useCallback(async () => {
    const [settings, billing, controls, briefs] = await Promise.all([
      apiRequest<typeof enterpriseSettings>('/api/enterprise/settings', 'GET', token),
      apiRequest<typeof billingOverview>('/api/enterprise/billing', 'GET', token),
      apiRequest<{ piiRedaction: boolean; retentionDays: number }>('/api/compliance/controls', 'GET', token),
      apiRequest<Array<{ id: string; weekStart: string; content: string; createdAt: string }>>(
        '/api/weekly-briefs',
        'GET',
        token
      )
    ]);
    setEnterpriseSettings(settings);
    setBillingOverview(billing);
    setWeeklyBriefs(briefs);
    setEnterpriseSettings((prev) =>
      prev
        ? {
            ...prev,
            compliance: controls
          }
        : prev
    );
  }, [token]);

  useEffect(() => {
    void runAction('Feature lab sync', async () => {
      await Promise.all([
        loadWorkflowPresets(),
        loadViews(),
        loadPortfolioState(),
        loadAlertState(),
        loadJournalState(),
        loadCollaborationState(),
        loadEnterpriseState()
      ]);
    });
  }, [
    loadAlertState,
    loadCollaborationState,
    loadEnterpriseState,
    loadJournalState,
    loadPortfolioState,
    loadViews,
    loadWorkflowPresets,
    runAction
  ]);

  useEffect(() => {
    if (!enterpriseSettings?.branding) {
      return;
    }
    document.documentElement.style.setProperty('--accent', enterpriseSettings.branding.primaryColor);
    document.documentElement.style.setProperty('--accent-soft', `${enterpriseSettings.branding.primaryColor}26`);
  }, [enterpriseSettings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey;
      if (isMeta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((current) => !current);
        return;
      }

      if (isMeta && event.shiftKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        void composeReport();
        return;
      }

      if (isMeta && event.shiftKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        void generateWeeklyBrief();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [composeReport, generateWeeklyBrief]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }
    void apiRequest<{ summary: string }>(
      `/api/session-memory/${encodeURIComponent(activeSessionId)}`,
      'GET',
      token
    )
      .then((payload) => setSessionMemory(payload.summary))
      .catch(() => setSessionMemory(''));
  }, [activeSessionId, token]);

  useEffect(() => {
    if (!latestQueryId) {
      return;
    }

    setCommentForm((prev) => (prev.targetId ? prev : { ...prev, targetId: latestQueryId }));
    setApprovalForm((prev) => (prev.targetId ? prev : { ...prev, targetId: latestQueryId }));
  }, [latestQueryId]);

  const commands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: 'compose_report',
        label: 'Compose Session Report',
        run: async () => {
          await composeReport();
          setPaletteOpen(false);
        }
      },
      {
        id: 'generate_weekly',
        label: 'Generate Weekly Brief',
        run: async () => {
          await generateWeeklyBrief();
          setPaletteOpen(false);
        }
      },
      {
        id: 'load_views',
        label: 'Refresh Saved Views',
        run: async () => {
          await loadViews();
          setPaletteOpen(false);
        }
      },
      {
        id: 'refresh_portfolio',
        label: 'Refresh Portfolio Insights',
        run: async () => {
          if (!selectedPortfolioId) {
            setStatus('No portfolio selected');
            return;
          }
          const insights = await apiRequest<typeof portfolioInsights>(
            `/api/portfolio/${encodeURIComponent(selectedPortfolioId)}/insights`,
            'GET',
            token
          );
          setPortfolioInsights(insights);
          setPaletteOpen(false);
        }
      }
    ],
    [composeReport, generateWeeklyBrief, loadViews, portfolioInsights, selectedPortfolioId, token]
  );

  return (
    <section className="feature-lab">
      <div className="feature-lab-head">
        <h3>Feature Lab (Roadmap Controls)</h3>
        <div className="feature-lab-actions">
          <button className="mini-button" type="button" onClick={() => setPaletteOpen(true)}>
            Command Palette (Ctrl/Cmd+K)
          </button>
          <button className="mini-button" type="button" onClick={() => void composeReport()} disabled={!activeSessionId || busy}>
            Compose Report
          </button>
          <button className="mini-button" type="button" onClick={() => void generateWeeklyBrief()} disabled={busy}>
            Generate Weekly Brief
          </button>
        </div>
      </div>

      {status && <p className="feature-status">{status}</p>}

      <div className="feature-grid">
        <details open>
          <summary>20, 24, 25, 26: Presets, Command Palette, Shortcuts, Saved Views</summary>
          <div className="feature-card">
            <h4>Guided Presets</h4>
            <div className="pill-row">
              {workflowPresets.map((preset) => (
                <button key={preset.id} type="button" className="ticker-pill" onClick={() => onApplyPreset(preset.id)}>
                  {preset.title}
                </button>
              ))}
            </div>

            <h4>Save Current View</h4>
            <div className="field-grid">
              <input
                placeholder="Preset name"
                value={viewForm.name}
                onChange={(event) => setViewForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <select
                value={viewForm.mode}
                onChange={(event) =>
                  setViewForm((prev) => ({ ...prev, mode: event.target.value as 'guided' | 'advanced' }))
                }
              >
                <option value="guided">guided</option>
                <option value="advanced">advanced</option>
              </select>
              <input
                placeholder="workflow id"
                value={viewForm.workflowId}
                onChange={(event) => setViewForm((prev) => ({ ...prev, workflowId: event.target.value }))}
              />
              <select
                value={viewForm.verbosity}
                onChange={(event) =>
                  setViewForm((prev) => ({
                    ...prev,
                    verbosity: event.target.value as 'short' | 'standard' | 'deep'
                  }))
                }
              >
                <option value="short">short</option>
                <option value="standard">standard</option>
                <option value="deep">deep</option>
              </select>
            </div>
            <button
              type="button"
              className="mini-button"
              disabled={!activeSessionId || !viewForm.name.trim() || busy}
              onClick={() =>
                void runAction('Save view preset', async () => {
                  if (!activeSessionId) {
                    return;
                  }
                  await apiRequest('/api/views', 'POST', token, {
                    sessionId: activeSessionId,
                    name: viewForm.name.trim(),
                    mode: viewForm.mode,
                    workflowId: viewForm.workflowId,
                    verbosity: viewForm.verbosity
                  });
                  setViewForm((prev) => ({ ...prev, name: '' }));
                  await loadViews();
                })
              }
            >
              Save View Preset
            </button>
            <ul className="simple-list">
              {viewPresets.map((item) => (
                <li key={item.id}>
                  <strong>{item.name}</strong> · {item.mode}/{item.workflowId}/{item.verbosity}
                </li>
              ))}
            </ul>
          </div>
        </details>

        <details>
          <summary>23: One-Click Report Composer</summary>
          <div className="feature-card">
            <button type="button" className="mini-button" onClick={() => void composeReport()} disabled={!activeSessionId || busy}>
              Compose Session Memo
            </button>
            <textarea value={reportMarkdown} readOnly placeholder="Report output appears here" />
          </div>
        </details>

        <details>
          <summary>28, 29, 30, 33: Portfolio Import, Sizing, Heatmap, Rebalance</summary>
          <div className="feature-card">
            <div className="field-grid">
              <input value={portfolioName} onChange={(event) => setPortfolioName(event.target.value)} placeholder="Portfolio name" />
              <button
                type="button"
                className="mini-button"
                onClick={() =>
                  void runAction('Import portfolio', async () => {
                    await apiRequest('/api/portfolio/import', 'POST', token, {
                      name: portfolioName,
                      source: 'csv',
                      csv: portfolioCsv
                    });
                    await loadPortfolioState();
                  })
                }
                disabled={busy}
              >
                Import CSV
              </button>
            </div>
            <textarea value={portfolioCsv} onChange={(event) => setPortfolioCsv(event.target.value)} />
            <div className="field-grid">
              <select value={selectedPortfolioId} onChange={(event) => setSelectedPortfolioId(event.target.value)}>
                <option value="">Select portfolio</option>
                {portfolios.map((portfolio) => (
                  <option key={portfolio.id} value={portfolio.id}>
                    {portfolio.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="mini-button"
                disabled={!selectedPortfolioId || busy}
                onClick={() =>
                  void runAction('Load portfolio insights', async () => {
                    const payload = await apiRequest<typeof portfolioInsights>(
                      `/api/portfolio/${encodeURIComponent(selectedPortfolioId)}/insights`,
                      'GET',
                      token
                    );
                    setPortfolioInsights(payload);
                  })
                }
              >
                Load Insights
              </button>
            </div>
            {portfolioInsights && (
              <div className="insight-grid">
                <div>
                  <h5>Total Value</h5>
                  <p>${portfolioInsights.totalValue.toFixed(2)}</p>
                </div>
                <div>
                  <h5>Factor Exposure</h5>
                  <ul className="simple-list">
                    {Object.entries(portfolioInsights.factorExposure).map(([factor, value]) => (
                      <li key={factor}>
                        {factor}: {value.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h5>Sector Heatmap</h5>
                  <ul className="simple-list">
                    {portfolioInsights.sectorHeatmap.map((item) => (
                      <li key={item.sector}>
                        {item.sector}: {item.weightPct.toFixed(2)}%
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h5>Rebalance Suggestions</h5>
                  <ul className="simple-list">
                    {portfolioInsights.rebalanceSuggestions.map((item) => (
                      <li key={item.ticker}>
                        {item.ticker}: {item.action} ({item.currentWeight.toFixed(2)}% → {item.targetWeight.toFixed(2)}%)
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <h4>Position Sizing Assistant</h4>
            <div className="field-grid">
              <input
                type="number"
                value={positionSizingForm.portfolioValue}
                onChange={(event) =>
                  setPositionSizingForm((prev) => ({ ...prev, portfolioValue: Number(event.target.value) }))
                }
                placeholder="Portfolio value"
              />
              <input
                type="number"
                value={positionSizingForm.riskPct}
                onChange={(event) =>
                  setPositionSizingForm((prev) => ({ ...prev, riskPct: Number(event.target.value) }))
                }
                placeholder="Risk %"
              />
              <input
                type="number"
                value={positionSizingForm.entryPrice}
                onChange={(event) =>
                  setPositionSizingForm((prev) => ({ ...prev, entryPrice: Number(event.target.value) }))
                }
                placeholder="Entry"
              />
              <input
                type="number"
                value={positionSizingForm.stopPrice}
                onChange={(event) =>
                  setPositionSizingForm((prev) => ({ ...prev, stopPrice: Number(event.target.value) }))
                }
                placeholder="Stop"
              />
            </div>
            <button
              type="button"
              className="mini-button"
              disabled={busy}
              onClick={() =>
                void runAction('Position sizing', async () => {
                  const result = await apiRequest<typeof positionSizingResult>(
                    '/api/portfolio/position-size',
                    'POST',
                    token,
                    positionSizingForm
                  );
                  setPositionSizingResult(result);
                })
              }
            >
              Calculate Size
            </button>
            {positionSizingResult && (
              <p>
                Risk ${positionSizingResult.riskDollars.toFixed(2)} | Shares {positionSizingResult.shares} | Notional $
                {positionSizingResult.notional.toFixed(2)}
              </p>
            )}
          </div>
        </details>

        <details>
          <summary>31, 32: Price/Event/Scenario Alerts</summary>
          <div className="feature-card">
            <div className="field-grid">
              <input
                value={alertForm.ticker}
                onChange={(event) => setAlertForm((prev) => ({ ...prev, ticker: event.target.value.toUpperCase() }))}
                placeholder="Ticker"
              />
              <select
                value={alertForm.kind}
                onChange={(event) =>
                  setAlertForm((prev) => ({
                    ...prev,
                    kind: event.target.value as 'price' | 'earnings' | 'event' | 'scenario'
                  }))
                }
              >
                <option value="price">price</option>
                <option value="earnings">earnings</option>
                <option value="event">event</option>
                <option value="scenario">scenario</option>
              </select>
              <select
                value={alertForm.operator}
                onChange={(event) =>
                  setAlertForm((prev) => ({ ...prev, operator: event.target.value as '>' | '>=' | '<' | '<=' | '==' }))
                }
              >
                <option value=">">{'>'}</option>
                <option value=">=">{'>='}</option>
                <option value="<">{'<'}</option>
                <option value="<=">{'<='}</option>
                <option value="==">{'=='}</option>
              </select>
              <input
                type="number"
                value={alertForm.threshold}
                onChange={(event) => setAlertForm((prev) => ({ ...prev, threshold: Number(event.target.value) }))}
                placeholder="Threshold"
              />
              <input
                value={alertForm.metric}
                onChange={(event) => setAlertForm((prev) => ({ ...prev, metric: event.target.value }))}
                placeholder="Metric"
              />
            </div>
            <button
              type="button"
              className="mini-button"
              disabled={busy}
              onClick={() =>
                void runAction('Create alert', async () => {
                  await apiRequest('/api/alerts', 'POST', token, alertForm);
                  await loadAlertState();
                })
              }
            >
              Create Alert
            </button>
            <textarea
              value={alertEvalInput}
              onChange={(event) => setAlertEvalInput(event.target.value)}
              placeholder='{"AAPL":200}'
            />
            <button
              type="button"
              className="mini-button"
              disabled={busy}
              onClick={() =>
                void runAction('Evaluate alerts', async () => {
                  const prices = parseJsonRecord(alertEvalInput);
                  const result = await apiRequest<
                    Array<{ alertId: string; ticker: string; triggered: boolean; observedValue: number }>
                  >('/api/alerts/evaluate', 'POST', token, { prices, metrics: prices });
                  setAlertEvaluations(result);
                })
              }
            >
              Evaluate Alerts
            </button>
            <ul className="simple-list">
              {alerts.map((item) => (
                <li key={item.id}>
                  {item.ticker} {item.metric} {item.operator} {item.threshold} ({item.kind})
                </li>
              ))}
            </ul>
            <ul className="simple-list">
              {alertEvaluations.map((item) => (
                <li key={item.alertId}>
                  {item.ticker}: {item.triggered ? 'TRIGGERED' : 'clear'} ({item.observedValue})
                </li>
              ))}
            </ul>
          </div>
        </details>

        <details>
          <summary>34, 35, 36, 37, 38: Journal + Collaboration + Approvals + Share Links</summary>
          <div className="feature-card">
            <h4>Decision Journal</h4>
            <div className="field-grid">
              <input
                placeholder="Journal title"
                value={journalForm.title}
                onChange={(event) => setJournalForm((prev) => ({ ...prev, title: event.target.value }))}
              />
              <input
                placeholder="Outcome (optional)"
                value={journalForm.outcome}
                onChange={(event) => setJournalForm((prev) => ({ ...prev, outcome: event.target.value }))}
              />
            </div>
            <textarea
              placeholder="Thesis"
              value={journalForm.thesis}
              onChange={(event) => setJournalForm((prev) => ({ ...prev, thesis: event.target.value }))}
            />
            <textarea
              placeholder="Post-mortem (optional)"
              value={journalForm.postMortem}
              onChange={(event) => setJournalForm((prev) => ({ ...prev, postMortem: event.target.value }))}
            />
            <button
              type="button"
              className="mini-button"
              disabled={!activeSessionId || !journalForm.title.trim() || !journalForm.thesis.trim() || busy}
              onClick={() =>
                void runAction('Save journal', async () => {
                  if (!activeSessionId) {
                    return;
                  }
                  await apiRequest('/api/journal', 'POST', token, {
                    sessionId: activeSessionId,
                    title: journalForm.title,
                    thesis: journalForm.thesis,
                    outcome: journalForm.outcome || undefined,
                    postMortem: journalForm.postMortem || undefined
                  });
                  await loadJournalState();
                  setJournalForm({ title: '', thesis: '', outcome: '', postMortem: '' });
                })
              }
            >
              Save Journal Entry
            </button>
            <ul className="simple-list">
              {journalEntries.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong> · {item.outcome ?? 'in-progress'}
                </li>
              ))}
            </ul>

            <h4>Shared Workspaces</h4>
            <div className="field-grid">
              <input
                value={workspaceForm.name}
                onChange={(event) => setWorkspaceForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Workspace"
              />
              <input
                value={workspaceForm.ownerEmail}
                onChange={(event) => setWorkspaceForm((prev) => ({ ...prev, ownerEmail: event.target.value }))}
                placeholder="Owner email"
              />
              <button
                type="button"
                className="mini-button"
                disabled={busy}
                onClick={() =>
                  void runAction('Create workspace', async () => {
                    await apiRequest('/api/workspaces', 'POST', token, workspaceForm);
                    await loadCollaborationState();
                  })
                }
              >
                Create
              </button>
            </div>
            <div className="field-grid">
              <select
                value={workspaceMemberForm.workspaceId}
                onChange={(event) =>
                  setWorkspaceMemberForm((prev) => ({ ...prev, workspaceId: event.target.value }))
                }
              >
                <option value="">Choose workspace</option>
                {workspaces.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input
                value={workspaceMemberForm.userEmail}
                onChange={(event) =>
                  setWorkspaceMemberForm((prev) => ({ ...prev, userEmail: event.target.value }))
                }
                placeholder="Member email"
              />
              <select
                value={workspaceMemberForm.role}
                onChange={(event) =>
                  setWorkspaceMemberForm((prev) => ({
                    ...prev,
                    role: event.target.value as 'owner' | 'editor' | 'viewer' | 'approver'
                  }))
                }
              >
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
                <option value="approver">approver</option>
                <option value="owner">owner</option>
              </select>
              <button
                type="button"
                className="mini-button"
                disabled={!workspaceMemberForm.workspaceId || busy}
                onClick={() =>
                  void runAction('Add workspace member', async () => {
                    await apiRequest(
                      `/api/workspaces/${encodeURIComponent(workspaceMemberForm.workspaceId)}/members`,
                      'POST',
                      token,
                      {
                        userEmail: workspaceMemberForm.userEmail,
                        role: workspaceMemberForm.role
                      }
                    );
                    await loadCollaborationState();
                  })
                }
              >
                Add Member
              </button>
            </div>

            <h4>Comments/Annotations</h4>
            <div className="field-grid">
              <select
                value={commentForm.targetType}
                onChange={(event) =>
                  setCommentForm((prev) => ({ ...prev, targetType: event.target.value as 'query' | 'report' | 'chart' }))
                }
              >
                <option value="query">query</option>
                <option value="report">report</option>
                <option value="chart">chart</option>
              </select>
              <input
                value={commentForm.targetId}
                onChange={(event) => setCommentForm((prev) => ({ ...prev, targetId: event.target.value }))}
                placeholder="Target id"
              />
              <input
                value={commentForm.body}
                onChange={(event) => setCommentForm((prev) => ({ ...prev, body: event.target.value }))}
                placeholder="Comment"
              />
              <button
                type="button"
                className="mini-button"
                disabled={!commentForm.targetId || !commentForm.body.trim() || busy}
                onClick={() =>
                  void runAction('Add comment', async () => {
                    await apiRequest('/api/comments', 'POST', token, commentForm);
                    const list = await apiRequest<
                      Array<{ id: string; targetType: string; body: string; createdAt: string }>
                    >('/api/comments', 'GET', token);
                    setComments(list);
                  })
                }
              >
                Add Comment
              </button>
            </div>
            <ul className="simple-list">
              {comments.map((item) => (
                <li key={item.id}>
                  [{item.targetType}] {item.body}
                </li>
              ))}
            </ul>

            <h4>Approval Workflow</h4>
            <div className="field-grid">
              <select
                value={approvalForm.targetType}
                onChange={(event) =>
                  setApprovalForm((prev) => ({ ...prev, targetType: event.target.value as 'report' | 'note' }))
                }
              >
                <option value="report">report</option>
                <option value="note">note</option>
              </select>
              <input
                value={approvalForm.targetId}
                onChange={(event) => setApprovalForm((prev) => ({ ...prev, targetId: event.target.value }))}
                placeholder="Target id"
              />
              <input
                value={approvalForm.requestedFrom}
                onChange={(event) => setApprovalForm((prev) => ({ ...prev, requestedFrom: event.target.value }))}
                placeholder="Approver email"
              />
              <button
                type="button"
                className="mini-button"
                disabled={!approvalForm.targetId || busy}
                onClick={() =>
                  void runAction('Create approval request', async () => {
                    await apiRequest('/api/approvals', 'POST', token, approvalForm);
                    await loadCollaborationState();
                  })
                }
              >
                Request Approval
              </button>
            </div>
            <ul className="simple-list">
              {approvals.map((item) => (
                <li key={item.id}>
                  {item.targetType}:{item.targetId} · {item.status}
                  {item.status === 'pending' && (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="inline-link"
                        onClick={() =>
                          void runAction('Approve request', async () => {
                            await apiRequest(`/api/approvals/${encodeURIComponent(item.id)}/decision`, 'POST', token, {
                              status: 'approved',
                              decidedBy: 'auto-approver'
                            });
                            await loadCollaborationState();
                          })
                        }
                      >
                        approve
                      </button>
                      {' / '}
                      <button
                        type="button"
                        className="inline-link"
                        onClick={() =>
                          void runAction('Reject request', async () => {
                            await apiRequest(`/api/approvals/${encodeURIComponent(item.id)}/decision`, 'POST', token, {
                              status: 'rejected',
                              decidedBy: 'auto-approver'
                            });
                            await loadCollaborationState();
                          })
                        }
                      >
                        reject
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>

            <h4>Share Links</h4>
            <div className="field-grid">
              <select
                value={shareLinkForm.targetType}
                onChange={(event) =>
                  setShareLinkForm((prev) => ({ ...prev, targetType: event.target.value as 'report' | 'session' }))
                }
              >
                <option value="session">session</option>
                <option value="report">report</option>
              </select>
              <input
                value={shareLinkForm.targetId}
                onChange={(event) => setShareLinkForm((prev) => ({ ...prev, targetId: event.target.value }))}
                placeholder="Target id"
              />
              <input
                type="number"
                value={shareLinkForm.expiresInHours}
                onChange={(event) =>
                  setShareLinkForm((prev) => ({ ...prev, expiresInHours: Number(event.target.value) }))
                }
                placeholder="Expires in hours"
              />
              <button
                type="button"
                className="mini-button"
                disabled={!shareLinkForm.targetId || busy}
                onClick={() =>
                  void runAction('Create share link', async () => {
                    await apiRequest('/api/share-links', 'POST', token, shareLinkForm);
                    await loadCollaborationState();
                  })
                }
              >
                Create Link
              </button>
            </div>
            <ul className="simple-list">
              {shareLinks.map((item) => (
                <li key={item.id}>
                  {item.targetType}:{item.targetId} · token {item.token.slice(0, 10)}... · exp {item.expiresAt}
                </li>
              ))}
            </ul>
          </div>
        </details>

        <details>
          <summary>39, 40: Distribution + Webhooks</summary>
          <div className="feature-card">
            <h4>Distribution</h4>
            <div className="field-grid">
              <select
                value={distributionForm.channel}
                onChange={(event) =>
                  setDistributionForm((prev) => ({
                    ...prev,
                    channel: event.target.value as 'slack' | 'discord' | 'email'
                  }))
                }
              >
                <option value="email">email</option>
                <option value="slack">slack</option>
                <option value="discord">discord</option>
              </select>
              <select
                value={distributionForm.targetType}
                onChange={(event) =>
                  setDistributionForm((prev) => ({ ...prev, targetType: event.target.value as 'report' | 'session' }))
                }
              >
                <option value="session">session</option>
                <option value="report">report</option>
              </select>
              <input
                value={distributionForm.targetId}
                onChange={(event) => setDistributionForm((prev) => ({ ...prev, targetId: event.target.value }))}
                placeholder="Target id"
              />
              <input
                value={distributionForm.target}
                onChange={(event) => setDistributionForm((prev) => ({ ...prev, target: event.target.value }))}
                placeholder="Destination"
              />
              <button
                type="button"
                className="mini-button"
                disabled={!distributionForm.targetId || busy}
                onClick={() =>
                  void runAction('Distribute report', async () => {
                    await apiRequest('/api/distribution/send', 'POST', token, distributionForm);
                    await loadCollaborationState();
                  })
                }
              >
                Send Snapshot
              </button>
            </div>
            <ul className="simple-list">
              {distributionLogs.map((item) => (
                <li key={item.id}>
                  {item.channel} → {item.target} ({item.targetType}) at {item.createdAt}
                </li>
              ))}
            </ul>

            <h4>Webhooks</h4>
            <div className="field-grid">
              <input
                value={webhookForm.name}
                onChange={(event) => setWebhookForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Webhook name"
              />
              <input
                value={webhookForm.url}
                onChange={(event) => setWebhookForm((prev) => ({ ...prev, url: event.target.value }))}
                placeholder="https://..."
              />
              <input
                value={webhookForm.secret}
                onChange={(event) => setWebhookForm((prev) => ({ ...prev, secret: event.target.value }))}
                placeholder="Secret (optional)"
              />
              <button
                type="button"
                className="mini-button"
                disabled={busy}
                onClick={() =>
                  void runAction('Register webhook', async () => {
                    await apiRequest('/api/webhooks', 'POST', token, webhookForm);
                    await loadCollaborationState();
                  })
                }
              >
                Register
              </button>
            </div>
            <ul className="simple-list">
              {webhooks.map((item) => (
                <li key={item.id}>
                  {item.name} · {item.url} ({item.status}){' '}
                  <button
                    type="button"
                    className="inline-link"
                    onClick={() =>
                      void runAction('Webhook test', async () => {
                        await apiRequest(`/api/webhooks/${encodeURIComponent(item.id)}/test`, 'POST', token, {});
                        await loadCollaborationState();
                      })
                    }
                  >
                    test
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </details>

        <details>
          <summary>47, 48, 49, 50 + 46: Enterprise, Billing, Compliance, Branding, Weekly Brief</summary>
          <div className="feature-card">
            {enterpriseSettings && (
              <>
                <h4>SSO Providers</h4>
                <div className="field-grid">
                  <label>
                    <input
                      type="checkbox"
                      checked={enterpriseSettings.sso.googleEnabled}
                      onChange={(event) =>
                        setEnterpriseSettings((prev) =>
                          prev
                            ? {
                                ...prev,
                                sso: {
                                  ...prev.sso,
                                  googleEnabled: event.target.checked
                                }
                              }
                            : prev
                        )
                      }
                    />{' '}
                    Google
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={enterpriseSettings.sso.microsoftEnabled}
                      onChange={(event) =>
                        setEnterpriseSettings((prev) =>
                          prev
                            ? {
                                ...prev,
                                sso: {
                                  ...prev.sso,
                                  microsoftEnabled: event.target.checked
                                }
                              }
                            : prev
                        )
                      }
                    />{' '}
                    Microsoft
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={enterpriseSettings.sso.oktaEnabled}
                      onChange={(event) =>
                        setEnterpriseSettings((prev) =>
                          prev
                            ? {
                                ...prev,
                                sso: {
                                  ...prev.sso,
                                  oktaEnabled: event.target.checked
                                }
                              }
                            : prev
                        )
                      }
                    />{' '}
                    Okta
                  </label>
                  <input
                    value={enterpriseSettings.sso.oktaDomain ?? ''}
                    onChange={(event) =>
                      setEnterpriseSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              sso: {
                                ...prev.sso,
                                oktaDomain: event.target.value || null
                              }
                            }
                          : prev
                      )
                    }
                    placeholder="Okta domain"
                  />
                </div>

                <h4>Billing Quotas</h4>
                <div className="field-grid">
                  <input
                    type="number"
                    value={enterpriseSettings.billing.monthlyQuota}
                    onChange={(event) =>
                      setEnterpriseSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              billing: {
                                ...prev.billing,
                                monthlyQuota: Number(event.target.value)
                              }
                            }
                          : prev
                      )
                    }
                    placeholder="Monthly quota"
                  />
                  <input
                    type="number"
                    value={enterpriseSettings.billing.teamBudgetCap}
                    onChange={(event) =>
                      setEnterpriseSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              billing: {
                                ...prev.billing,
                                teamBudgetCap: Number(event.target.value)
                              }
                            }
                          : prev
                      )
                    }
                    placeholder="Team cap"
                  />
                </div>
                {billingOverview && (
                  <p>
                    Month {billingOverview.month}: usage ${billingOverview.usage.toFixed(2)} / quota $
                    {billingOverview.monthlyQuota.toFixed(2)} (remaining ${billingOverview.remaining.toFixed(2)})
                  </p>
                )}

                <h4>Compliance Controls</h4>
                <div className="field-grid">
                  <label>
                    <input
                      type="checkbox"
                      checked={enterpriseSettings.compliance.piiRedaction}
                      onChange={(event) =>
                        setEnterpriseSettings((prev) =>
                          prev
                            ? {
                                ...prev,
                                compliance: {
                                  ...prev.compliance,
                                  piiRedaction: event.target.checked
                                }
                              }
                            : prev
                        )
                      }
                    />{' '}
                    PII redaction
                  </label>
                  <input
                    type="number"
                    value={enterpriseSettings.compliance.retentionDays}
                    onChange={(event) =>
                      setEnterpriseSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              compliance: {
                                ...prev.compliance,
                                retentionDays: Number(event.target.value)
                              }
                            }
                          : prev
                      )
                    }
                    placeholder="Retention days"
                  />
                </div>

                <h4>White-Label Theme</h4>
                <div className="field-grid">
                  <input
                    value={enterpriseSettings.branding.themeName}
                    onChange={(event) =>
                      setEnterpriseSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              branding: {
                                ...prev.branding,
                                themeName: event.target.value
                              }
                            }
                          : prev
                      )
                    }
                    placeholder="Theme name"
                  />
                  <input
                    value={enterpriseSettings.branding.primaryColor}
                    onChange={(event) =>
                      setEnterpriseSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              branding: {
                                ...prev.branding,
                                primaryColor: event.target.value
                              }
                            }
                          : prev
                      )
                    }
                    placeholder="#0d7a6d"
                  />
                  <input
                    value={enterpriseSettings.branding.secondaryColor}
                    onChange={(event) =>
                      setEnterpriseSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              branding: {
                                ...prev.branding,
                                secondaryColor: event.target.value
                              }
                            }
                          : prev
                      )
                    }
                    placeholder="#13222f"
                  />
                  <input
                    value={enterpriseSettings.branding.customDomain ?? ''}
                    onChange={(event) =>
                      setEnterpriseSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              branding: {
                                ...prev.branding,
                                customDomain: event.target.value || null
                              }
                            }
                          : prev
                      )
                    }
                    placeholder="research.yourdomain.com"
                  />
                </div>
                <button
                  type="button"
                  className="mini-button"
                  disabled={busy}
                  onClick={() =>
                    void runAction('Save enterprise settings', async () => {
                      if (!enterpriseSettings) {
                        return;
                      }
                      await apiRequest('/api/enterprise/settings', 'POST', token, enterpriseSettings);
                      await loadEnterpriseState();
                    })
                  }
                >
                  Save Enterprise Settings
                </button>

                <div className="field-grid">
                  <select
                    value={ssoProvider}
                    onChange={(event) => setSsoProvider(event.target.value as 'google' | 'microsoft' | 'okta')}
                  >
                    <option value="google">google</option>
                    <option value="microsoft">microsoft</option>
                    <option value="okta">okta</option>
                  </select>
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() =>
                      void runAction('Fetch SSO URL', async () => {
                        const payload = await apiRequest<{ provider: string; enabled: boolean; url: string | null }>(
                          `/api/enterprise/sso-url?provider=${encodeURIComponent(ssoProvider)}`,
                          'GET',
                          token
                        );
                        setSsoLaunch(payload);
                      })
                    }
                  >
                    Get SSO Launch URL
                  </button>
                </div>
                {ssoLaunch && (
                  <p>
                    {ssoLaunch.provider}: {ssoLaunch.enabled ? ssoLaunch.url ?? 'configured without URL' : 'disabled'}
                  </p>
                )}

                <h4>Compliance Preview</h4>
                <textarea value={redactionInput} onChange={(event) => setRedactionInput(event.target.value)} />
                <div className="field-grid">
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() =>
                      void runAction('Run redaction preview', async () => {
                        const payload = await apiRequest<{ redacted: string; enabled: boolean }>(
                          '/api/compliance/redact-preview',
                          'POST',
                          token,
                          { text: redactionInput }
                        );
                        setRedactionPreview(payload);
                      })
                    }
                  >
                    Preview Redaction
                  </button>
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() =>
                      void runAction('Run retention sweep', async () => {
                        const payload = await apiRequest<{
                          retentionDays: number;
                          cutoff: string;
                          candidateQueryCount: number;
                          note: string;
                        }>('/api/compliance/retention/run', 'POST', token, {});
                        setRetentionSweep(payload);
                      })
                    }
                  >
                    Run Retention Sweep
                  </button>
                </div>
                {redactionPreview && (
                  <p>
                    {redactionPreview.enabled ? 'Redacted' : 'Redaction disabled'}: {redactionPreview.redacted}
                  </p>
                )}
                {retentionSweep && (
                  <p>
                    Cutoff {retentionSweep.cutoff} · candidates {retentionSweep.candidateQueryCount} ·{' '}
                    {retentionSweep.note}
                  </p>
                )}

                <h4>Weekly Briefs + Session Memory</h4>
                <ul className="simple-list">
                  {weeklyBriefs.slice(0, 5).map((brief) => (
                    <li key={brief.id}>
                      {brief.weekStart} · {brief.content.slice(0, 90)}...
                    </li>
                  ))}
                </ul>
                {sessionMemory && (
                  <textarea value={sessionMemory} readOnly />
                )}
              </>
            )}
          </div>
        </details>
      </div>

      {paletteOpen && (
        <div className="palette-overlay" role="presentation" onClick={() => setPaletteOpen(false)}>
          <div className="palette-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
            <h4>Command Palette</h4>
            <small>Shortcuts: Ctrl/Cmd+K open, Ctrl/Cmd+Shift+R report, Ctrl/Cmd+Shift+B weekly brief</small>
            <ul className="simple-list">
              {commands.map((command) => (
                <li key={command.id}>
                  <button type="button" className="mini-button" onClick={() => void command.run()}>
                    {command.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
