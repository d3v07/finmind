import type { QueryArtifacts } from '../dexter/adapter.js';
import { getCircuitBreaker, withRetry } from '../system/resilience.js';

type PricePoint = {
  label: string;
  value: number;
};

type MetricSnapshot = {
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

type ExaSearchResult = {
  title?: string;
  url?: string;
  text?: string;
  summary?: string;
  publishedDate?: string;
};

type ExaSearchResponse = {
  results?: ExaSearchResult[];
};

type MarketArtifactProfile = 'light' | 'full';

type EnrichOptions = {
  profile?: MarketArtifactProfile;
  response?: string;
  history?: Array<{
    createdAt: string;
    question: string;
    response: string | null;
  }>;
  sessionId?: string;
};

const POSITIVE_SENTIMENT_WORDS = [
  'beat',
  'beats',
  'surge',
  'rally',
  'upgrade',
  'strong',
  'growth',
  'record',
  'outperform',
  'bullish',
  'gain'
];

const NEGATIVE_SENTIMENT_WORDS = [
  'miss',
  'misses',
  'drop',
  'decline',
  'downgrade',
  'weak',
  'risk',
  'lawsuit',
  'underperform',
  'bearish',
  'loss'
];

function detectTickers(query: string): string[] {
  const unique = new Set<string>();
  const matches = query.match(/\b[A-Z]{1,5}\b/g) ?? [];

  for (const token of matches) {
    if (!['I', 'A', 'AN', 'THE', 'AND', 'OR', 'TO', 'IN', 'ON'].includes(token)) {
      unique.add(token);
    }
  }

  return [...unique].slice(0, 3);
}

function toDateString(input: Date): string {
  return input.toISOString().slice(0, 10);
}

async function fetchExaResults(
  query: string,
  options?: { numResults?: number; startPublishedDate?: string }
): Promise<ExaSearchResult[] | null> {
  const apiKey = process.env.EXASEARCH_API_KEY?.trim() ?? process.env.EXA_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const breaker = getCircuitBreaker('exasearch');
  const response = await breaker.execute(() =>
    withRetry(
      () =>
        fetch('https://api.exa.ai/search', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey
          },
          body: JSON.stringify({
            query,
            numResults: options?.numResults ?? 8,
            type: 'auto',
            startPublishedDate: options?.startPublishedDate,
            contents: { text: true, summary: true }
          })
        }),
      {
        maxRetries: 2,
        initialDelayMs: 700,
        maxDelayMs: 4000,
        multiplier: 2
      }
    )
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as ExaSearchResponse;
  return payload.results ?? null;
}

async function fetchPriceSeries(ticker: string): Promise<PricePoint[] | null> {
  const apiKey = process.env.FINANCIAL_DATASETS_API_KEY;
  if (!apiKey) {
    return null;
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 45);

  const url = new URL('https://api.financialdatasets.ai/prices/');
  url.searchParams.set('ticker', ticker);
  url.searchParams.set('interval', 'day');
  url.searchParams.set('interval_multiplier', '1');
  url.searchParams.set('start_date', toDateString(startDate));
  url.searchParams.set('end_date', toDateString(endDate));

  const breaker = getCircuitBreaker('financialdatasets');
  const response = await breaker.execute(() =>
    withRetry(
      () =>
        fetch(url.toString(), {
          headers: {
            'x-api-key': apiKey
          }
        }),
      {
        maxRetries: 3,
        initialDelayMs: 700,
        maxDelayMs: 20_000,
        multiplier: 2
      }
    )
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    prices?: Array<{
      time?: string;
      close?: number;
    }>;
  };

  const points = (payload.prices ?? [])
    .filter((entry) => typeof entry.close === 'number' && typeof entry.time === 'string')
    .slice(-30)
    .map((entry) => ({
      label: entry.time!.slice(5),
      value: Number(entry.close)
    }));

  if (points.length < 2) {
    return null;
  }

  return points;
}

async function fetchMetricSnapshot(ticker: string): Promise<MetricSnapshot | null> {
  const apiKey = process.env.FINANCIAL_DATASETS_API_KEY;
  if (!apiKey) {
    return null;
  }

  const url = new URL('https://api.financialdatasets.ai/financial-metrics/snapshot/');
  url.searchParams.set('ticker', ticker);

  const breaker = getCircuitBreaker('financialdatasets');
  const response = await breaker.execute(() =>
    withRetry(
      () =>
        fetch(url.toString(), {
          headers: {
            'x-api-key': apiKey
          }
        }),
      {
        maxRetries: 3,
        initialDelayMs: 700,
        maxDelayMs: 20_000,
        multiplier: 2
      }
    )
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    snapshot?: MetricSnapshot;
  };

  if (!payload.snapshot || !payload.snapshot.ticker) {
    return null;
  }

  return payload.snapshot;
}

function scoreSentiment(input: string): number {
  const normalized = input.toLowerCase();
  const positive = POSITIVE_SENTIMENT_WORDS.reduce(
    (sum, token) => sum + (normalized.includes(token) ? 1 : 0),
    0
  );
  const negative = NEGATIVE_SENTIMENT_WORDS.reduce(
    (sum, token) => sum + (normalized.includes(token) ? 1 : 0),
    0
  );

  if (positive === 0 && negative === 0) {
    return 0;
  }

  const raw = positive - negative;
  if (raw > 0) {
    return 1;
  }
  if (raw < 0) {
    return -1;
  }
  return 0;
}

function toSentimentLabel(score: number): 'positive' | 'neutral' | 'negative' {
  if (score > 0) {
    return 'positive';
  }
  if (score < 0) {
    return 'negative';
  }
  return 'neutral';
}

function extractIsoDates(input: string): string[] {
  const dates = new Set<string>();

  const isoMatches = input.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
  for (const candidate of isoMatches) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      dates.add(candidate);
    }
  }

  const monthNameMatches =
    input.match(
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/g
    ) ?? [];
  for (const candidate of monthNameMatches) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      dates.add(parsed.toISOString().slice(0, 10));
    }
  }

  return [...dates];
}

function summarizeText(input: string | undefined, maxLength = 220): string {
  const normalized = (input ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function parseMarkdownH2Sections(input: string): Array<{ title: string; body: string }> {
  const lines = input.replace(/\r/g, '').split('\n');
  const sections: Array<{ title: string; body: string }> = [];

  let currentTitle: string | null = null;
  let buffer: string[] = [];

  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      if (currentTitle) {
        sections.push({ title: currentTitle, body: buffer.join('\n').trim() });
      }
      currentTitle = match[1].trim();
      buffer = [];
      continue;
    }

    buffer.push(line);
  }

  if (currentTitle) {
    sections.push({ title: currentTitle, body: buffer.join('\n').trim() });
  }

  return sections;
}

function extractBulletsFromSectionBody(input: string, maxItems: number): string[] {
  const bullets: string[] = [];

  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const dashMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (dashMatch?.[1]) {
      bullets.push(summarizeText(dashMatch[1], 180));
    }

    const orderedMatch = trimmed.match(/^\d+[).]\s+(.*)$/);
    if (orderedMatch?.[1]) {
      bullets.push(summarizeText(orderedMatch[1], 180));
    }

    if (bullets.length >= maxItems) {
      return bullets;
    }
  }

  if (bullets.length > 0) {
    return bullets;
  }

  const normalized = input.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return ['No structured output returned.'];
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, maxItems);

  return sentences.length > 0 ? sentences.map((sentence) => summarizeText(sentence, 180)) : [summarizeText(normalized, 180)];
}

function buildStructuredBriefArtifact(
  response: string | undefined,
  tickers: string[],
  mode: 'guided' | 'advanced'
) {
  if (!response) {
    return undefined;
  }

  const sections = parseMarkdownH2Sections(response);
  const wantTitles =
    mode === 'guided'
      ? ['Thesis', 'Catalysts', 'Risks', 'Decision']
      : ['Summary', 'Thesis', 'Catalysts', 'Risks', 'Scenarios', 'Decision'];

  const sectionMap = new Map(sections.map((section) => [section.title.toLowerCase(), section.body]));

  const briefSections = wantTitles.map((title) => {
    const body = sectionMap.get(title.toLowerCase()) ?? '';
    return {
      title,
      bullets: extractBulletsFromSectionBody(body, mode === 'guided' ? 4 : 5)
    };
  });

  const primary = tickers[0] ?? null;
  const followUps =
    primary
      ? [
          {
            id: 'stress_test',
            label: 'Stress Test',
            prompt: `Run a risk stress test for ${primary} for the next 1-4 weeks. Output: top 3 downside scenarios, monitoring checklist, and invalidation.`,
            mode: 'guided' as const,
            verbosity: 'short' as const
          },
          {
            id: 'metrics_snapshot',
            label: 'Metrics Snapshot',
            prompt: `Give a quick metrics snapshot for ${primary}: valuation, margins, ROE, growth. Conclude with one-line implication for a short-term trade.`,
            mode: 'guided' as const,
            verbosity: 'short' as const
          },
          {
            id: 'catalyst_scan',
            label: 'Catalyst Scan',
            prompt: `List 5 near-term catalysts for ${primary} (2 bull, 2 bear, 1 neutral). Keep it concise and include any sources you used.`,
            mode: 'guided' as const,
            verbosity: 'short' as const
          },
          {
            id: 'deep_memo',
            label: 'Deep Memo',
            prompt: `Write a deep research memo on ${primary}: business, key drivers, valuation framing, bear cases, scenarios, and decision.`,
            mode: 'advanced' as const,
            verbosity: 'deep' as const
          }
        ]
      : [
          {
            id: 'clarify_universe',
            label: 'Clarify Universe',
            prompt:
              'Ask me 3 questions to narrow what to invest in today (timeframe, risk, sector constraints). Then propose 3 candidates with 1-line rationale each.',
            mode: 'guided' as const,
            verbosity: 'short' as const
          }
        ];

  return {
    mode,
    tickers,
    sections: briefSections,
    followUps,
    createdAt: new Date().toISOString()
  };
}

function extractCallPutRatios(input: string): number[] {
  const ratios: number[] = [];
  const normalized = input.toLowerCase();

  const callPutPattern = /call[\s/-]*put(?:\s+open\s+interest)?(?:\s+ratio)?\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/g;
  for (const match of normalized.matchAll(callPutPattern)) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0 && value < 10) {
      ratios.push(value);
    }
  }

  const putCallPattern = /put[\s/-]*call(?:\s+open\s+interest)?(?:\s+ratio)?\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/g;
  for (const match of normalized.matchAll(putCallPattern)) {
    const putCallValue = Number(match[1]);
    if (Number.isFinite(putCallValue) && putCallValue > 0 && putCallValue < 10) {
      ratios.push(Number((1 / putCallValue).toFixed(2)));
    }
  }

  return ratios;
}

function toOptionsSignal(score: number): 'bullish' | 'neutral' | 'bearish' {
  if (score >= 0.35) {
    return 'bullish';
  }
  if (score <= -0.35) {
    return 'bearish';
  }
  return 'neutral';
}

function detectFilingType(input: string): string | null {
  const match = input.match(/\b(10-K|10-Q|8-K|6-K|20-F|S-1|DEF 14A|13D|13G)\b/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function toRiskLevel(score: number): 'low' | 'medium' | 'high' {
  if (score >= 6) {
    return 'high';
  }
  if (score >= 3) {
    return 'medium';
  }
  return 'low';
}

function scoreOwnershipTrend(input: string): {
  institutionalTrend: 'increasing' | 'flat' | 'decreasing';
  insiderTrend: 'buying' | 'neutral' | 'selling';
  confidence: 'high' | 'medium' | 'low';
} {
  const normalized = input.toLowerCase();

  let institutionalScore = 0;
  if (normalized.includes('institutional ownership') || normalized.includes('13f')) {
    institutionalScore += 1;
  }
  if (normalized.includes('increased') || normalized.includes('accumulation')) {
    institutionalScore += 1;
  }
  if (normalized.includes('decreased') || normalized.includes('distribution') || normalized.includes('reduced')) {
    institutionalScore -= 1;
  }

  let insiderScore = 0;
  if (normalized.includes('insider buying') || normalized.includes('open market buy')) {
    insiderScore += 2;
  }
  if (normalized.includes('insider selling') || normalized.includes('sale by insider')) {
    insiderScore -= 2;
  }
  if (normalized.includes('director bought') || normalized.includes('ceo bought')) {
    insiderScore += 1;
  }
  if (normalized.includes('director sold') || normalized.includes('ceo sold')) {
    insiderScore -= 1;
  }

  const confidence =
    normalized.includes('13f') || normalized.includes('form 4')
      ? ('high' as const)
      : normalized.includes('institutional') || normalized.includes('insider')
        ? ('medium' as const)
        : ('low' as const);

  return {
    institutionalTrend:
      institutionalScore > 0 ? 'increasing' : institutionalScore < 0 ? 'decreasing' : 'flat',
    insiderTrend: insiderScore > 0 ? 'buying' : insiderScore < 0 ? 'selling' : 'neutral',
    confidence
  };
}

function extractDomain(input: string): string {
  try {
    return new URL(input).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function scoreSourceDomain(domain: string): number {
  if (domain.endsWith('.gov') || domain.includes('sec.gov')) {
    return 0.95;
  }
  if (
    domain.includes('reuters') ||
    domain.includes('bloomberg') ||
    domain.includes('wsj') ||
    domain.includes('ft.com') ||
    domain.includes('quartr')
  ) {
    return 0.88;
  }
  if (
    domain.includes('marketwatch') ||
    domain.includes('fool.com') ||
    domain.includes('seekingalpha') ||
    domain.includes('benzinga')
  ) {
    return 0.7;
  }
  if (domain.includes('reddit') || domain.includes('x.com') || domain.includes('twitter')) {
    return 0.45;
  }
  return 0.6;
}

function confidenceBadge(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.8) {
    return 'high';
  }
  if (score >= 0.6) {
    return 'medium';
  }
  return 'low';
}

function buildSourceConfidenceArtifact(sources: string[] | undefined) {
  const rows = [...new Set(sources ?? [])].slice(0, 12).map((url) => {
    const domain = extractDomain(url);
    const score = scoreSourceDomain(domain);
    return {
      url,
      domain,
      score: Number(score.toFixed(2)),
      badge: confidenceBadge(score)
    };
  });
  return rows.length > 0 ? rows : undefined;
}

function buildContradictionCheckArtifact(answer: string | undefined) {
  if (!answer || !answer.trim()) {
    return {
      status: 'clear' as const,
      findings: ['No contradiction analysis performed because response text was empty.']
    };
  }

  const normalized = answer.toLowerCase();
  const findings: string[] = [];

  if (
    (normalized.includes('high conviction') || normalized.includes('strong buy')) &&
    (normalized.includes('high risk') || normalized.includes('elevated risk') || normalized.includes('material risk'))
  ) {
    findings.push('High-conviction language appears together with elevated-risk language.');
  }
  if (
    normalized.includes('no major risks') &&
    (normalized.includes('drawdown') || normalized.includes('liquidity risk') || normalized.includes('uncertainty'))
  ) {
    findings.push('Statement "no major risks" conflicts with explicit risk disclosures.');
  }
  if (
    normalized.includes('short term') &&
    (normalized.includes('five-year') || normalized.includes('long-term secular'))
  ) {
    findings.push('Short-term framing includes long-term assumptions without bridge logic.');
  }

  return {
    status: findings.length > 0 ? ('warning' as const) : ('clear' as const),
    findings:
      findings.length > 0 ? findings : ['No obvious thesis/evidence contradiction heuristics were triggered.']
  };
}

function buildAssumptionStressArtifact(query: string, answer: string | undefined) {
  const horizon =
    /short|week|month/i.test(query)
      ? 'near-term horizon'
      : /year|long/i.test(query)
        ? 'long-term horizon'
        : 'mixed horizon';

  const text = `${query}\n${answer ?? ''}`.toLowerCase();
  const scenarios = [
    {
      name: 'Bear Case',
      assumption: 'Earnings guidance and demand momentum weaken versus expectations.',
      impact: 'Valuation multiple compresses and downside volatility increases.',
      likelihood: text.includes('risk') || text.includes('uncertain') ? 'high' : 'medium'
    },
    {
      name: 'Base Case',
      assumption: 'Current consensus assumptions hold with moderate execution quality.',
      impact: `Price tracks fundamentals under ${horizon}.`,
      likelihood: 'medium'
    },
    {
      name: 'Bull Case',
      assumption: 'Catalysts resolve positively with stronger-than-expected forward indicators.',
      impact: 'Multiple expansion and positive momentum continuation.',
      likelihood: text.includes('catalyst') || text.includes('upside') ? 'medium' : 'low'
    }
  ] as const;

  return {
    baseCase: `Analysis framed under ${horizon}.`,
    scenarios: scenarios.map((entry) => ({
      name: entry.name,
      assumption: entry.assumption,
      impact: entry.impact,
      likelihood: entry.likelihood
    }))
  };
}

function extractThesisLine(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/thesis|decision|summary|recommend/i.test(line) && line.length <= 220) {
      return summarizeText(line, 200);
    }
  }

  const firstParagraph = lines.find((line) => line.length > 30);
  return firstParagraph ? summarizeText(firstParagraph, 200) : null;
}

function buildThesisMemoryArtifact(
  sessionId: string | undefined,
  history: EnrichOptions['history']
) {
  if (!sessionId || !history || history.length === 0) {
    return undefined;
  }

  const evolution = history
    .slice(-6)
    .map((entry) => {
      const thesis = extractThesisLine(entry.response ?? entry.question);
      if (!thesis) {
        return null;
      }
      return {
        timestamp: entry.createdAt,
        thesis
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (evolution.length === 0) {
    return undefined;
  }

  return {
    sessionId,
    evolution
  };
}

function buildMultiAgentTraceArtifact(
  query: string,
  answer: string | undefined,
  sourceCount: number
) {
  const querySummary = summarizeText(query, 120);
  const answerSummary = summarizeText(answer, 140);
  const criticWarning: 'completed' | 'warning' =
    answer && buildContradictionCheckArtifact(answer).status === 'warning'
      ? 'warning'
      : 'completed';

  return [
    {
      agent: 'planner' as const,
      status: 'completed' as const,
      summary: `Plan built for: ${querySummary}`
    },
    {
      agent: 'collector' as const,
      status: 'completed' as const,
      summary: `Collected evidence across ${sourceCount} sources and market APIs.`
    },
    {
      agent: 'critic' as const,
      status: criticWarning,
      summary:
        criticWarning === 'warning'
          ? 'Critic flagged potential thesis/evidence tension; review contradiction panel.'
          : `Critic found no major internal conflicts. ${answerSummary ? `Key output: ${answerSummary}` : ''}`.trim()
    }
  ];
}

function extractTranscriptPairs(
  input: string,
  maxPairs = 4
): Array<{ question: string; answerSummary: string }> {
  const pairs: Array<{ question: string; answerSummary: string }> = [];

  const qaPattern =
    /Q(?:uestion)?\s*[:-]\s*([^\n]{6,280}\?)\s*[\r\n]+A(?:nswer)?\s*[:-]\s*([^\n]{20,420})/gi;
  for (const match of input.matchAll(qaPattern)) {
    const question = summarizeText(match[1], 160);
    const answerSummary = summarizeText(match[2], 260);
    if (question && answerSummary) {
      pairs.push({ question, answerSummary });
    }
    if (pairs.length >= maxPairs) {
      return pairs;
    }
  }

  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let index = 0; index < lines.length - 1; index += 1) {
    if (pairs.length >= maxPairs) {
      break;
    }

    const rawQuestion = lines[index];
    const rawAnswer = lines[index + 1];
    if (!rawQuestion.includes('?')) {
      continue;
    }
    if (rawQuestion.length < 8 || rawQuestion.length > 280) {
      continue;
    }
    if (rawAnswer.length < 20) {
      continue;
    }

    const question = summarizeText(rawQuestion.replace(/^Q(?:uestion)?\s*[:-]\s*/i, ''), 160);
    const answerSummary = summarizeText(rawAnswer.replace(/^A(?:nswer)?\s*[:-]\s*/i, ''), 260);
    if (question && answerSummary) {
      pairs.push({ question, answerSummary });
    }
  }

  const unique = new Map<string, { question: string; answerSummary: string }>();
  for (const pair of pairs) {
    if (!unique.has(pair.question)) {
      unique.set(pair.question, pair);
    }
  }

  return [...unique.values()].slice(0, maxPairs);
}

async function buildEarningsCalendarArtifact(ticker: string) {
  const results = await fetchExaResults(`${ticker} next earnings date announcement`, { numResults: 10 });
  if (!results || results.length === 0) {
    return null;
  }

  const counts = new Map<string, number>();
  const today = new Date().toISOString().slice(0, 10);
  const sourceUrls: string[] = [];

  for (const result of results) {
    if (result.url) {
      sourceUrls.push(result.url);
    }
    const text = [result.title, result.summary, result.text].filter(Boolean).join('\n');
    const dateCandidates = extractIsoDates(text);

    for (const date of dateCandidates) {
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
  }

  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }

    const aFuture = a[0] >= today ? 1 : 0;
    const bFuture = b[0] >= today ? 1 : 0;
    if (bFuture !== aFuture) {
      return bFuture - aFuture;
    }

    return a[0].localeCompare(b[0]);
  });

  const best = sorted[0] ?? null;
  if (!best) {
    return {
      ticker,
      nextEarningsDate: null,
      confidence: 'low' as const,
      sources: sourceUrls.slice(0, 5)
    };
  }

  const [nextEarningsDate, supportCount] = best;
  const confidence =
    supportCount >= 2 && nextEarningsDate >= today
      ? ('high' as const)
      : nextEarningsDate >= today
        ? ('medium' as const)
        : ('low' as const);

  return {
    ticker,
    nextEarningsDate,
    confidence,
    sources: sourceUrls.slice(0, 5)
  };
}

async function buildNewsSentimentArtifact(ticker: string) {
  const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const results = await fetchExaResults(`${ticker} stock news`, {
    numResults: 12,
    startPublishedDate: start
  });
  if (!results || results.length === 0) {
    return null;
  }

  const grouped = new Map<
    string,
    {
      total: number;
      count: number;
    }
  >();

  const topHeadlines: Array<{ title: string; url: string; sentiment: 'positive' | 'neutral' | 'negative' }> = [];

  for (const result of results) {
    const text = [result.title, result.summary, result.text].filter(Boolean).join('\n');
    const score = scoreSentiment(text);
    const date = result.publishedDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const current = grouped.get(date) ?? { total: 0, count: 0 };
    grouped.set(date, { total: current.total + score, count: current.count + 1 });

    if (result.title && result.url && topHeadlines.length < 6) {
      topHeadlines.push({
        title: result.title,
        url: result.url,
        sentiment: toSentimentLabel(score)
      });
    }
  }

  const timeline = [...grouped.entries()]
    .map(([date, value]) => ({
      date,
      score: Number((value.total / Math.max(1, value.count)).toFixed(2)),
      headlineCount: value.count
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    ticker,
    windowDays: 7,
    timeline,
    topHeadlines
  };
}

async function buildOptionsActivityArtifact(ticker: string, fallbackScore: number | null) {
  const start = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const results = await fetchExaResults(`${ticker} unusual options activity call put ratio`, {
    numResults: 10,
    startPublishedDate: start
  });

  const sources: string[] = [];
  const highlights = new Set<string>();
  const ratioValues: number[] = [];
  let sentimentScoreTotal = 0;
  let sentimentCount = 0;

  for (const result of results ?? []) {
    if (result.url) {
      sources.push(result.url);
    }

    const text = [result.title, result.summary, result.text].filter(Boolean).join('\n');
    const ratios = extractCallPutRatios(text);
    ratioValues.push(...ratios);

    const score = scoreSentiment(text);
    sentimentScoreTotal += score;
    sentimentCount += 1;

    const summary = summarizeText(result.title ?? result.summary, 140);
    if (summary) {
      highlights.add(summary);
    }
  }

  const averageScore =
    sentimentCount > 0
      ? sentimentScoreTotal / sentimentCount
      : fallbackScore ?? 0;

  if (highlights.size === 0) {
    if (results && results.length > 0) {
      highlights.add('Indexed options chatter found, but no concise signal extracted.');
    } else {
      highlights.add('No recent indexed options tape data found. Signal inferred from related market context.');
    }
  }

  const callPutRatio =
    ratioValues.length > 0
      ? Number((ratioValues.reduce((sum, value) => sum + value, 0) / ratioValues.length).toFixed(2))
      : null;

  return {
    ticker,
    signal: toOptionsSignal(averageScore),
    callPutRatio,
    highlights: [...highlights].slice(0, 4),
    sourceCount: sources.length,
    sources: [...new Set(sources)].slice(0, 8)
  };
}

async function buildFilingChangesArtifact(ticker: string) {
  const start = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const results = await fetchExaResults(`${ticker} SEC filing 8-K 10-Q 10-K change summary`, {
    numResults: 10,
    startPublishedDate: start
  });

  const entries: Array<{ filingType: string; filingDate: string | null; summary: string }> = [];
  const sources: string[] = [];
  let riskScore = 0;

  for (const result of results ?? []) {
    if (result.url) {
      sources.push(result.url);
    }

    const text = [result.title, result.summary, result.text].filter(Boolean).join('\n');
    const filingType = detectFilingType(text) ?? 'Unknown';
    const dates = extractIsoDates(text).sort((a, b) => b.localeCompare(a));
    const filingDate = dates[0] ?? null;

    const summary = summarizeText(result.summary ?? result.title ?? result.text, 220);
    if (summary) {
      entries.push({
        filingType,
        filingDate,
        summary
      });
    }

    const lowered = text.toLowerCase();
    if (lowered.includes('restatement') || lowered.includes('material weakness')) {
      riskScore += 3;
    }
    if (lowered.includes('litigation') || lowered.includes('investigation')) {
      riskScore += 2;
    }
    if (lowered.includes('debt') || lowered.includes('downgrade') || lowered.includes('liquidity')) {
      riskScore += 1;
    }
  }

  const dedupedEntries = new Map<string, { filingType: string; filingDate: string | null; summary: string }>();
  for (const entry of entries) {
    if (!dedupedEntries.has(entry.summary)) {
      dedupedEntries.set(entry.summary, entry);
    }
  }

  const changes = [...dedupedEntries.values()].slice(0, 5);
  if (changes.length === 0) {
    changes.push({
      filingType: 'Unknown',
      filingDate: null,
      summary: 'No recent SEC filing changes were extracted from indexed sources.'
    });
  }

  const sortedByDate = [...changes]
    .filter((item) => item.filingDate !== null)
    .sort((a, b) => (b.filingDate ?? '').localeCompare(a.filingDate ?? ''));
  const latest = sortedByDate[0] ?? changes[0];

  return {
    ticker,
    latestFilingType: latest?.filingType ?? null,
    latestFilingDate: latest?.filingDate ?? null,
    riskLevel: toRiskLevel(riskScore),
    changes,
    sources: [...new Set(sources)].slice(0, 8)
  };
}

async function buildTranscriptQaArtifact(ticker: string) {
  const start = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const results = await fetchExaResults(`${ticker} earnings call transcript Q&A`, {
    numResults: 8,
    startPublishedDate: start
  });

  const sources: string[] = [];
  const items: Array<{
    question: string;
    answerSummary: string;
    sentiment: 'positive' | 'neutral' | 'negative';
  }> = [];

  for (const result of results ?? []) {
    if (items.length >= 4) {
      break;
    }

    if (result.url) {
      sources.push(result.url);
    }

    const text = [result.text, result.summary, result.title].filter(Boolean).join('\n');
    const pairs = extractTranscriptPairs(text, 4 - items.length);
    for (const pair of pairs) {
      items.push({
        question: pair.question,
        answerSummary: pair.answerSummary,
        sentiment: toSentimentLabel(scoreSentiment(pair.answerSummary))
      });
    }
  }

  if (items.length === 0) {
    const first = results?.[0];
    const fallbackAnswer = summarizeText(
      first?.summary ?? first?.text ?? 'No transcript Q&A content was extracted from configured sources.',
      260
    );
    items.push({
      question: 'Was recent earnings transcript Q&A extracted?',
      answerSummary: fallbackAnswer || 'No transcript Q&A content was extracted from configured sources.',
      sentiment: 'neutral'
    });
  }

  return {
    ticker,
    asOf: new Date().toISOString(),
    items: items.slice(0, 4),
    sources: [...new Set(sources)].slice(0, 8)
  };
}

async function buildOwnershipTrendArtifact(ticker: string) {
  const start = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const results = await fetchExaResults(
    `${ticker} institutional ownership trend insider buying selling 13F Form 4`,
    {
      numResults: 8,
      startPublishedDate: start
    }
  );

  const sources: string[] = [];
  const highlights = new Set<string>();
  const scorePayloads: ReturnType<typeof scoreOwnershipTrend>[] = [];

  for (const result of results ?? []) {
    if (result.url) {
      sources.push(result.url);
    }
    const text = [result.title, result.summary, result.text].filter(Boolean).join('\n');
    if (!text.trim()) {
      continue;
    }

    scorePayloads.push(scoreOwnershipTrend(text));
    const summary = summarizeText(result.summary ?? result.title, 140);
    if (summary) {
      highlights.add(summary);
    }
  }

  const institutionalAggregate =
    scorePayloads.reduce((sum, entry) => {
      if (entry.institutionalTrend === 'increasing') {
        return sum + 1;
      }
      if (entry.institutionalTrend === 'decreasing') {
        return sum - 1;
      }
      return sum;
    }, 0);

  const insiderAggregate =
    scorePayloads.reduce((sum, entry) => {
      if (entry.insiderTrend === 'buying') {
        return sum + 1;
      }
      if (entry.insiderTrend === 'selling') {
        return sum - 1;
      }
      return sum;
    }, 0);

  const confidence =
    scorePayloads.some((entry) => entry.confidence === 'high')
      ? ('high' as const)
      : scorePayloads.length >= 2
        ? ('medium' as const)
        : ('low' as const);

  return {
    ticker,
    institutionalTrend:
      institutionalAggregate > 0 ? ('increasing' as const) : institutionalAggregate < 0 ? ('decreasing' as const) : ('flat' as const),
    insiderTrend:
      insiderAggregate > 0 ? ('buying' as const) : insiderAggregate < 0 ? ('selling' as const) : ('neutral' as const),
    highlights:
      highlights.size > 0
        ? [...highlights].slice(0, 4)
        : ['No clear ownership trend extracted from indexed sources.'],
    confidence,
    sources: [...new Set(sources)].slice(0, 8)
  };
}

async function buildMacroCards() {
  const proxies = [
    { label: 'US Equities', ticker: 'SPY' },
    { label: 'Tech Growth', ticker: 'QQQ' },
    { label: 'US Treasuries', ticker: 'TLT' },
    { label: 'US Dollar Proxy', ticker: 'UUP' },
    { label: 'Gold Proxy', ticker: 'GLD' }
  ];

  const rows = await Promise.all(
    proxies.map(async (proxy) => {
      const points = await fetchPriceSeries(proxy.ticker);
      if (!points || points.length < 2) {
        return null;
      }

      const first = points[0]?.value ?? null;
      const last = points[points.length - 1]?.value ?? null;
      const changePct30d =
        first && last ? Number((((last - first) / first) * 100).toFixed(2)) : null;

      return {
        label: proxy.label,
        ticker: proxy.ticker,
        lastPrice: Number((last ?? 0).toFixed(2)),
        changePct30d
      };
    })
  );

  return rows.filter((item): item is NonNullable<typeof item> => item !== null);
}

function buildPriceChartArtifact(ticker: string, points: PricePoint[]) {
  const first = points[0]?.value ?? null;
  const last = points[points.length - 1]?.value ?? null;

  const changePct =
    first && last
      ? Number((((last - first) / first) * 100).toFixed(2))
      : null;

  return {
    ticker,
    title: `${ticker} Recent Price Trend`,
    points,
    changePct
  };
}

function buildMacroCardsFromCharts(
  charts: Array<{
    ticker: string;
    points: PricePoint[];
    changePct: number | null;
  }>
) {
  return charts
    .slice(0, 5)
    .map((chart) => {
      const lastPoint = chart.points[chart.points.length - 1];
      if (!lastPoint) {
        return null;
      }

      return {
        label: `${chart.ticker} Snapshot`,
        ticker: chart.ticker,
        lastPrice: Number(lastPoint.value.toFixed(2)),
        changePct30d: chart.changePct
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function mergeSources(existing: string[] | undefined, incoming: string[] | undefined): string[] | undefined {
  const merged = new Set<string>();
  for (const value of existing ?? []) {
    if (value) {
      merged.add(value);
    }
  }
  for (const value of incoming ?? []) {
    if (value) {
      merged.add(value);
    }
  }

  const result = [...merged].slice(0, 20);
  return result.length > 0 ? result : undefined;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function buildComparisonRows(left: MetricSnapshot, right: MetricSnapshot) {
  const map: Array<{ key: keyof MetricSnapshot; metric: string }> = [
    { key: 'price_to_earnings_ratio', metric: 'P/E' },
    { key: 'price_to_sales_ratio', metric: 'P/S' },
    { key: 'enterprise_value_to_ebitda_ratio', metric: 'EV/EBITDA' },
    { key: 'free_cash_flow_yield', metric: 'FCF Yield' },
    { key: 'return_on_equity', metric: 'ROE' },
    { key: 'net_margin', metric: 'Net Margin' },
    { key: 'revenue_growth', metric: 'Revenue Growth' },
    { key: 'earnings_growth', metric: 'Earnings Growth' }
  ];

  return map.map((item) => {
    const leftValue = toNullableNumber(left[item.key]);
    const rightValue = toNullableNumber(right[item.key]);
    const delta =
      leftValue !== null && rightValue !== null
        ? Number((leftValue - rightValue).toFixed(4))
        : null;

    return {
      metric: item.metric,
      leftTicker: left.ticker,
      rightTicker: right.ticker,
      leftValue,
      rightValue,
      delta
    };
  });
}

export async function enrichArtifactsWithMarketData(
  query: string,
  existing: QueryArtifacts | undefined,
  options?: EnrichOptions
): Promise<QueryArtifacts | undefined> {
  const next: QueryArtifacts = {
    ...(existing ?? {})
  };
  const profile = options?.profile ?? 'full';
  const mode = profile === 'light' ? 'guided' : 'advanced';

  const tickers = detectTickers(query);
  const structuredBrief = buildStructuredBriefArtifact(options?.response, tickers, mode);
  if (structuredBrief) {
    next.structuredBrief = structuredBrief;
  }
  if (tickers.length === 0) {
    return Object.keys(next).length > 0 ? next : undefined;
  }

  const seriesResults = await Promise.all(
    tickers.map(async (ticker) => {
      const points = await fetchPriceSeries(ticker);
      return points ? buildPriceChartArtifact(ticker, points) : null;
    })
  );
  const charts = seriesResults.filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (charts.length > 0) {
    next.priceCharts = charts;
    next.priceChart = charts[0];
  }

  const primaryMetrics = await fetchMetricSnapshot(tickers[0]);
  if (primaryMetrics) {
    next.metricSnapshot = primaryMetrics;
  }

  if (tickers.length >= 2) {
    const rightMetrics = await fetchMetricSnapshot(tickers[1]);

    if (primaryMetrics && rightMetrics) {
      next.comparisonTable = {
        title: `${tickers[0]} vs ${tickers[1]} Key Metrics`,
        rows: buildComparisonRows(primaryMetrics, rightMetrics)
      };
    }
  }

  const [macroCards, earningsCalendar, newsSentiment] = await Promise.all([
    profile === 'full' ? buildMacroCards() : Promise.resolve([]),
    buildEarningsCalendarArtifact(tickers[0]),
    buildNewsSentimentArtifact(tickers[0])
  ]);

  const fallbackMacroCards = macroCards.length > 0 ? macroCards : buildMacroCardsFromCharts(charts);
  if (fallbackMacroCards.length > 0) {
    next.macroCards = fallbackMacroCards;
  }

  if (earningsCalendar) {
    next.earningsCalendar = earningsCalendar;
    next.sources = mergeSources(next.sources, earningsCalendar.sources);
  }

  if (newsSentiment) {
    next.newsSentiment = newsSentiment;
    next.sources = mergeSources(
      next.sources,
      newsSentiment.topHeadlines.map((item) => item.url)
    );
  }

  if (profile === 'full') {
    const fallbackNewsScore =
      newsSentiment && newsSentiment.timeline.length > 0
        ? newsSentiment.timeline.reduce((sum, item) => sum + item.score, 0) / newsSentiment.timeline.length
        : null;

    const [optionsActivity, filingChanges, transcriptQA, ownershipTrend] = await Promise.all([
      buildOptionsActivityArtifact(tickers[0], fallbackNewsScore),
      buildFilingChangesArtifact(tickers[0]),
      buildTranscriptQaArtifact(tickers[0]),
      buildOwnershipTrendArtifact(tickers[0])
    ]);

    next.optionsActivity = optionsActivity;
    next.filingChanges = filingChanges;
    next.transcriptQA = transcriptQA;
    next.ownershipTrend = ownershipTrend;

    next.sources = mergeSources(next.sources, optionsActivity.sources);
    next.sources = mergeSources(next.sources, filingChanges.sources);
    next.sources = mergeSources(next.sources, transcriptQA.sources);
    next.sources = mergeSources(next.sources, ownershipTrend.sources);

    const sourceConfidence = buildSourceConfidenceArtifact(next.sources);
    if (sourceConfidence) {
      next.sourceConfidence = sourceConfidence;
    }

    const contradictionCheck = buildContradictionCheckArtifact(options?.response);
    next.contradictionCheck = contradictionCheck;

    next.assumptionStress = buildAssumptionStressArtifact(query, options?.response);

    const thesisMemory = buildThesisMemoryArtifact(options?.sessionId, options?.history);
    if (thesisMemory) {
      next.thesisMemory = thesisMemory;
    }

    next.multiAgentTrace = buildMultiAgentTraceArtifact(
      query,
      options?.response,
      next.sources?.length ?? 0
    );
  }

  return Object.keys(next).length > 0 ? next : undefined;
}
