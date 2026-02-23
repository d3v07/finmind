import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { QueryRecord, QueryUsage, Session } from '@finmind/shared';
import { buildUsageSummary, estimateTokensFromText, inferToolCosts } from '../system/costs.js';
import { enforceStructuredResponse } from '../system/response-contract.js';
import { getCircuitBreaker, withRetry } from '../system/resilience.js';

export type QueryArtifacts = {
  structuredBrief?: {
    mode: 'guided' | 'advanced';
    tickers: string[];
    sections: Array<{ title: string; bullets: string[] }>;
    followUps?: Array<{
      id: string;
      label: string;
      prompt: string;
      mode: 'guided' | 'advanced';
      verbosity: 'short' | 'standard' | 'deep';
    }>;
    createdAt: string;
  };
  sources?: string[];
  toolCalls?: Array<{
    tool: string;
    args: Record<string, unknown>;
    result: string;
  }>;
  priceChart?: {
    ticker: string;
    title: string;
    points: Array<{ label: string; value: number }>;
    changePct: number | null;
  };
  priceCharts?: Array<{
    ticker: string;
    title: string;
    points: Array<{ label: string; value: number }>;
    changePct: number | null;
  }>;
  metricSnapshot?: {
    ticker: string;
    price_to_earnings_ratio?: number | null;
    price_to_sales_ratio?: number | null;
    enterprise_value_to_ebitda_ratio?: number | null;
    free_cash_flow_yield?: number | null;
    return_on_equity?: number | null;
    net_margin?: number | null;
    revenue_growth?: number | null;
    earnings_growth?: number | null;
  };
  comparisonTable?: {
    title: string;
    rows: Array<{
      metric: string;
      leftTicker: string;
      rightTicker: string;
      leftValue: number | null;
      rightValue: number | null;
      delta: number | null;
    }>;
  };
  macroCards?: Array<{
    label: string;
    ticker: string;
    lastPrice: number;
    changePct30d: number | null;
  }>;
  earningsCalendar?: {
    ticker: string;
    nextEarningsDate: string | null;
    confidence: 'high' | 'medium' | 'low';
    sources: string[];
  };
  newsSentiment?: {
    ticker: string;
    windowDays: number;
    timeline: Array<{ date: string; score: number; headlineCount: number }>;
    topHeadlines: Array<{
      title: string;
      url: string;
      sentiment: 'positive' | 'neutral' | 'negative';
    }>;
  };
  optionsActivity?: {
    ticker: string;
    signal: 'bullish' | 'neutral' | 'bearish';
    callPutRatio: number | null;
    highlights: string[];
    sourceCount: number;
    sources: string[];
  };
  filingChanges?: {
    ticker: string;
    latestFilingType: string | null;
    latestFilingDate: string | null;
    riskLevel: 'low' | 'medium' | 'high';
    changes: Array<{
      filingType: string;
      filingDate: string | null;
      summary: string;
    }>;
    sources: string[];
  };
  transcriptQA?: {
    ticker: string;
    asOf: string;
    items: Array<{
      question: string;
      answerSummary: string;
      sentiment: 'positive' | 'neutral' | 'negative';
    }>;
    sources: string[];
  };
  ownershipTrend?: {
    ticker: string;
    institutionalTrend: 'increasing' | 'flat' | 'decreasing';
    insiderTrend: 'buying' | 'neutral' | 'selling';
    highlights: string[];
    confidence: 'high' | 'medium' | 'low';
    sources: string[];
  };
  multiAgentTrace?: Array<{
    agent: 'planner' | 'collector' | 'critic';
    status: 'completed' | 'warning';
    summary: string;
  }>;
  sourceConfidence?: Array<{
    url: string;
    domain: string;
    score: number;
    badge: 'high' | 'medium' | 'low';
  }>;
  contradictionCheck?: {
    status: 'clear' | 'warning';
    findings: string[];
  };
  assumptionStress?: {
    baseCase: string;
    scenarios: Array<{
      name: string;
      assumption: string;
      impact: string;
      likelihood: 'low' | 'medium' | 'high';
    }>;
  };
  thesisMemory?: {
    sessionId: string;
    evolution: Array<{
      timestamp: string;
      thesis: string;
    }>;
  };
};

export type AgentRunInput = {
  prompt: string;
  session: Session;
  history: QueryRecord[];
  mode: 'guided' | 'advanced';
  verbosity: 'short' | 'standard' | 'deep';
};

export type AgentRunResult = {
  answer: string;
  provider: string;
  model: string;
  usage?: QueryUsage;
  artifacts?: QueryArtifacts;
};

export interface DexterAdapter {
  run(input: AgentRunInput): Promise<AgentRunResult>;
}

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function detectTickerCandidates(prompt: string): string[] {
  const unique = new Set<string>();
  const matches = prompt.match(/\b[A-Z]{1,5}\b/g) ?? [];

  for (const token of matches) {
    if (!['I', 'A', 'AN', 'THE', 'AND', 'OR', 'TO', 'IN', 'ON'].includes(token)) {
      unique.add(token);
    }
  }

  return [...unique].slice(0, 5);
}

function buildMockAnswer(input: AgentRunInput): string {
  const tickers = detectTickerCandidates(input.prompt);
  const contextCount = input.history.length;

  const header = `## FinMind Research Response\n\n`;
  const summary =
    `### Summary\n` +
    `I processed your request in local mock mode. This response is structured like a production run and can be replaced with live provider output once keys are configured.\n\n`;

  const tickerLine =
    tickers.length > 0
      ? `### Detected Tickers\n${tickers.map((ticker) => `- ${ticker}`).join('\n')}\n\n`
      : `### Detected Tickers\n- No explicit ticker symbol detected\n\n`;

  const sessionLine =
    `### Session Context\n` +
    `- Session: ${input.session.title}\n` +
    `- Prior query count: ${contextCount}\n\n`;

  const nextActions =
    `### Suggested Next Checks\n` +
    `- Ask for a timeframe (for example: last 5 years or last 8 quarters).\n` +
    `- Request comparative analysis versus peers.\n` +
    `- Ask for revenue, margin, and cash flow trend decomposition.\n\n`;

  const disclaimer =
    `### Note\n` +
    `This is a mock execution path designed to keep the app fully runnable without external keys.\n`;

  return `${header}${summary}${tickerLine}${sessionLine}${nextActions}${disclaimer}`;
}

function parseSourcesFromToolCalls(
  toolCalls: Array<{ tool: string; args: Record<string, unknown>; result: string }>
): string[] {
  const sourceSet = new Set<string>();

  for (const call of toolCalls) {
    try {
      const parsed = JSON.parse(call.result) as {
        sourceUrls?: string[];
      };

      for (const url of parsed.sourceUrls ?? []) {
        if (url) {
          sourceSet.add(url);
        }
      }
    } catch {
      // Ignore non-JSON tool payloads.
    }
  }

  return [...sourceSet].slice(0, 12);
}

function parseDexterPayload(rawStdout: string): {
  answer: string;
  provider: string;
  model: string;
  toolCalls: Array<{ tool: string; args: Record<string, unknown>; result: string }>;
} {
  const marker = '__FINMIND_JSON__';
  const line = rawStdout
    .split('\n')
    .map((entry) => entry.trim())
    .reverse()
    .find((entry) => entry.startsWith(marker));

  if (!line) {
    throw new Error('Dexter output did not contain a parseable JSON marker');
  }

  const payload = JSON.parse(line.slice(marker.length)) as {
    answer?: string;
    provider?: string;
    model?: string;
    toolCalls?: Array<{ tool: string; args: Record<string, unknown>; result: string }>;
  };

  if (!payload.answer || !payload.model) {
    throw new Error('Dexter payload was missing answer/model');
  }

  return {
    answer: payload.answer,
    provider: payload.provider ?? 'dexter-openrouter',
    model: payload.model,
    toolCalls: payload.toolCalls ?? []
  };
}

class MockDexterAdapter implements DexterAdapter {
  private readonly model: string;

  constructor(model = 'finmind-local-mock-v1') {
    this.model = model;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const inputTokens = estimateTokensFromText(input.prompt);
    const outputTokens = estimateTokensFromText(buildMockAnswer(input));
    const usage = buildUsageSummary({
      inputTokens,
      outputTokens,
      financialCalls: 0,
      exaCalls: 0
    });

    return {
      answer: enforceStructuredResponse(buildMockAnswer(input), input.mode),
      provider: 'mock',
      model: this.model,
      usage
    };
  }
}

class OpenRouterDexterAdapter implements DexterAdapter {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly providerLabel: string;

  constructor(apiKey: string, model: string, providerLabel = 'openrouter') {
    this.apiKey = apiKey;
    this.model = model;
    this.providerLabel = providerLabel;
  }

  private parseAffordableTokenLimit(bodyText: string): number | null {
    const match = bodyText.match(/can only afford\\s+(\\d+)\\s+tokens/i);
    if (match) {
      const value = Number(match[1]);
      return Number.isFinite(value) && value > 0 ? value : null;
    }
    return null;
  }

  private resolveMaxTokens(input: AgentRunInput): number {
    const configured = Number(process.env.FINMIND_OPENROUTER_MAX_TOKENS);
    if (Number.isFinite(configured) && configured > 0) {
      return Math.max(256, Math.min(8192, Math.floor(configured)));
    }

    // Default to conservative output limits so we don't trigger OpenRouter credit-limit 402 errors.
    // These values are "good enough" for structured, evidence-first responses.
    if (input.verbosity === 'short') {
      return input.mode === 'guided' ? 700 : 900;
    }

    if (input.verbosity === 'standard') {
      return 2200;
    }

    // deep
    return 4500;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const historyContext = input.history
      .slice(-4)
      .map((entry) => {
        const question =
          entry.question.length > 240 ? `${entry.question.slice(0, 240)}...` : entry.question;
        const response = entry.response ?? '[pending]';
        const trimmed = response.length > 900 ? `${response.slice(0, 900)}...` : response;
        return `Q: ${question}\nA: ${trimmed}`;
      })
      .join('\n\n');

    const responseLengthRule =
      input.verbosity === 'short'
        ? 'Keep response very concise: 120-220 words max, 4-8 bullets total.'
        : input.verbosity === 'deep'
          ? 'Provide a detailed response with explicit assumptions, scenarios, and risks.'
          : 'Keep response balanced: concise but complete.';

    const modeRule =
      input.mode === 'guided'
        ? 'Use actionable structure only: Thesis, Catalysts, Risks, Decision. Avoid long explanations.'
        : 'Provide deep research structure with assumptions, data-backed arguments, and scenario analysis.';

    const systemPrompt = [
      'You are Dexter-style financial research assistant.',
      'Provide accurate, structured markdown and clearly state assumptions.',
      modeRule,
      responseLengthRule
    ].join(' ');

    const userPrompt = [
      `Session title: ${input.session.title}`,
      historyContext ? `Session history:\n${historyContext}` : 'Session history: none',
      `User request: ${input.prompt}`
    ].join('\n\n');

    let maxTokens = this.resolveMaxTokens(input);

    const makeRequest = (maxTokensOverride: number) =>
      fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokensOverride,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: userPrompt
            }
          ]
        })
      });

    const openrouterBreaker = getCircuitBreaker('openrouter');
    let response = await openrouterBreaker.execute(() =>
      withRetry(
        () => makeRequest(maxTokens),
        {
          maxRetries: 3,
          initialDelayMs: 800,
          maxDelayMs: 30_000,
          multiplier: 2
        }
      )
    );

    if (!response.ok) {
      const body = await response.text();

      // OpenRouter returns a 402 when the account cannot afford the requested max_tokens.
      // Retry once with the affordable token cap if the error provides one.
      if (response.status === 402) {
        const affordable = this.parseAffordableTokenLimit(body);
        if (affordable && affordable < maxTokens) {
          maxTokens = Math.max(256, Math.floor(affordable * 0.92));
          response = await openrouterBreaker.execute(() =>
            withRetry(() => makeRequest(maxTokens), {
              maxRetries: 1,
              initialDelayMs: 800,
              maxDelayMs: 10_000,
              multiplier: 2
            })
          );

          if (!response.ok) {
            const retryBody = await response.text();
            throw new Error(
              `OpenRouter request failed (${response.status}): ${retryBody || body}`
            );
          }
        } else {
          throw new Error(`OpenRouter request failed (${response.status}): ${body}`);
        }
      } else {
        throw new Error(`OpenRouter request failed (${response.status}): ${body}`);
      }
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      throw new Error('OpenRouter response did not contain completion text');
    }

    const inputTokens = payload.usage?.prompt_tokens ?? estimateTokensFromText(userPrompt);
    const outputTokens = payload.usage?.completion_tokens ?? estimateTokensFromText(answer);
    const usage = buildUsageSummary({
      inputTokens,
      outputTokens,
      financialCalls: 0,
      exaCalls: 0
    });

    return {
      answer: enforceStructuredResponse(answer, input.mode),
      provider: this.providerLabel,
      model: this.model,
      usage
    };
  }
}

class DexterSubprocessAdapter implements DexterAdapter {
  private readonly dexterPath: string;
  private readonly model: string;
  private readonly bunBinary: string;

  constructor(dexterPath: string, model: string) {
    this.dexterPath = dexterPath;
    this.model = model;
    this.bunBinary =
      process.env.BUN_BINARY ??
      (process.env.HOME ? `${process.env.HOME}/.bun/bin/bun` : 'bun');
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const modeInstruction =
      input.mode === 'guided'
        ? 'Output mode: guided workflow. Keep it short and decision-oriented.'
        : 'Output mode: advanced research. Be comprehensive.';

    const verbosityInstruction =
      input.verbosity === 'short'
        ? 'Length rule: 120-220 words max, bullet-heavy.'
        : input.verbosity === 'deep'
          ? 'Length rule: detailed long-form analysis with scenarios and assumptions.'
          : 'Length rule: medium depth.';

    const query = [
      modeInstruction,
      verbosityInstruction,
      `Session title: ${input.session.title}`,
      input.history.length > 0
        ? `Recent context:\n${input.history
            .slice(-4)
            .map((item) => `- Q: ${item.question}\n  A: ${item.response ?? '[none]'}`)
            .join('\n')}`
        : 'Recent context: none',
      `User query: ${input.prompt}`
    ].join('\n\n');

    const queryBase64 = Buffer.from(query, 'utf-8').toString('base64');

    const args = [
      'run',
      '--cwd',
      this.dexterPath,
      'scripts/run-query.ts',
      '--query-base64',
      queryBase64,
      '--model',
      this.model,
      '--max-iterations',
      String(process.env.FINMIND_DEXTER_MAX_ITERATIONS ?? '8')
    ];

    const output = await new Promise<{ stdout: string; stderr: string }>((resolvePromise, reject) => {
      const child = spawn(this.bunBinary, args, {
        env: {
          ...process.env,
          OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? '',
          FINANCIAL_DATASETS_API_KEY: process.env.FINANCIAL_DATASETS_API_KEY ?? '',
          EXASEARCH_API_KEY: process.env.EXASEARCH_API_KEY ?? process.env.EXA_API_KEY ?? '',
          TAVILY_API_KEY: process.env.TAVILY_API_KEY ?? ''
        }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        reject(error);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Dexter subprocess failed with code ${code}: ${stderr || stdout}`));
          return;
        }

        resolvePromise({ stdout, stderr });
      });
    });

    const parsed = parseDexterPayload(output.stdout);
    const sources = parseSourcesFromToolCalls(parsed.toolCalls);
    const inferred = inferToolCosts(parsed.toolCalls);
    const usage = buildUsageSummary({
      inputTokens: estimateTokensFromText(query),
      outputTokens: estimateTokensFromText(parsed.answer),
      financialCalls: inferred.financialCalls,
      exaCalls: inferred.exaCalls
    });

    return {
      answer: enforceStructuredResponse(parsed.answer, input.mode),
      provider: 'dexter',
      model: parsed.model,
      usage,
      artifacts: {
        sources,
        toolCalls: parsed.toolCalls
      }
    };
  }
}

class FallbackDexterAdapter implements DexterAdapter {
  private readonly primary: DexterAdapter;
  private readonly fallback: DexterAdapter;

  constructor(primary: DexterAdapter, fallback: DexterAdapter) {
    this.primary = primary;
    this.fallback = fallback;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    try {
      return await this.primary.run(input);
    } catch (primaryError) {
      const message = primaryError instanceof Error ? primaryError.message : String(primaryError);
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          service: 'api',
          message: 'dexter_primary_failed_falling_back',
          error: message
        })
      );

      return this.fallback.run(input);
    }
  }
}

export function createDexterAdapterFromEnv(): DexterAdapter {
  const mode = (process.env.FINMIND_AGENT_MODE ?? 'dexter').toLowerCase();

  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const openRouterModel = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini';
  const dexterPath = resolve(
    process.env.FINMIND_DEXTER_PATH ?? '/Users/dev/Documents/PROJECT_LOWLEVEL/dexter'
  );
  const allowFallback =
    process.env.FINMIND_DEXTER_FALLBACK_TO_OPENROUTER === undefined ||
    isTruthy(process.env.FINMIND_DEXTER_FALLBACK_TO_OPENROUTER);
  const hasOpenRouterKey = Boolean(openRouterApiKey?.trim());
  const openRouterAdapter = hasOpenRouterKey
    ? new OpenRouterDexterAdapter(openRouterApiKey!, openRouterModel, 'openrouter')
    : null;

  if (mode === 'mock') {
    return new MockDexterAdapter();
  }

  if (mode === 'openrouter') {
    if (openRouterAdapter) {
      return openRouterAdapter;
    }
    return new MockDexterAdapter('finmind-local-mock-missing-openrouter-key');
  }

  if (mode === 'dexter') {
    if (hasOpenRouterKey) {
      const dexterAdapter = new DexterSubprocessAdapter(dexterPath, openRouterModel);
      if (openRouterAdapter && allowFallback) {
        const fallback = new OpenRouterDexterAdapter(
          openRouterApiKey!,
          openRouterModel,
          'openrouter-fallback'
        );
        return new FallbackDexterAdapter(dexterAdapter, fallback);
      }
      return dexterAdapter;
    }
    return new MockDexterAdapter('finmind-local-mock-missing-openrouter-key');
  }

  if (mode === 'auto') {
    if (hasOpenRouterKey) {
      const dexterAdapter = new DexterSubprocessAdapter(dexterPath, openRouterModel);
      if (openRouterAdapter && allowFallback) {
        const fallback = new OpenRouterDexterAdapter(
          openRouterApiKey!,
          openRouterModel,
          'openrouter-fallback'
        );
        return new FallbackDexterAdapter(dexterAdapter, fallback);
      }
      return dexterAdapter;
    }

    return new MockDexterAdapter();
  }

  return new MockDexterAdapter();
}
