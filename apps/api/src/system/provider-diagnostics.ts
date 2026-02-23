import type { ProviderDiagnostics } from '@finmind/shared';
import { withRetry } from './resilience.js';

type ProviderProbe = {
  configured: boolean;
  reachable: boolean;
  latencyMs: number | null;
  error: string | null;
};

const REQUEST_TIMEOUT_MS = 4500;
const HISTORY_LIMIT = 50;

const diagnosticsHistory = {
  openrouter: [] as ProviderProbe[],
  financialDatasets: [] as ProviderProbe[],
  exasearch: [] as ProviderProbe[]
};

function pushHistory(key: keyof typeof diagnosticsHistory, value: ProviderProbe) {
  diagnosticsHistory[key].push(value);
  if (diagnosticsHistory[key].length > HISTORY_LIMIT) {
    diagnosticsHistory[key].shift();
  }
}

async function timedFetch(
  url: string,
  init: RequestInit
): Promise<{ ok: boolean; latencyMs: number; error: string | null }> {
  const startedAt = Date.now();

  try {
    const response = await withRetry(
      () =>
        fetch(url, {
          ...init,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        }),
      {
        maxRetries: 2,
        initialDelayMs: 400,
        maxDelayMs: 2500,
        multiplier: 2
      }
    );
    return {
      ok: response.ok,
      latencyMs: Date.now() - startedAt,
      error: response.ok ? null : `${response.status} ${response.statusText}`
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'network_error'
    };
  }
}

async function probeOpenRouter(): Promise<ProviderProbe> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return { configured: false, reachable: false, latencyMs: null, error: 'missing_api_key' };
  }

  const result = await timedFetch('https://openrouter.ai/api/v1/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  return {
    configured: true,
    reachable: result.ok,
    latencyMs: result.latencyMs,
    error: result.error
  };
}

async function probeFinancialDatasets(): Promise<ProviderProbe> {
  const apiKey = process.env.FINANCIAL_DATASETS_API_KEY?.trim();
  if (!apiKey) {
    return { configured: false, reachable: false, latencyMs: null, error: 'missing_api_key' };
  }

  const url = new URL('https://api.financialdatasets.ai/prices/');
  url.searchParams.set('ticker', 'AAPL');
  url.searchParams.set('interval', 'day');
  url.searchParams.set('interval_multiplier', '1');
  url.searchParams.set('start_date', '2025-12-01');
  url.searchParams.set('end_date', '2026-01-15');

  const result = await timedFetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-api-key': apiKey
    }
  });

  return {
    configured: true,
    reachable: result.ok,
    latencyMs: result.latencyMs,
    error: result.error
  };
}

async function probeExaSearch(): Promise<ProviderProbe> {
  const apiKey = process.env.EXASEARCH_API_KEY?.trim() ?? process.env.EXA_API_KEY?.trim();
  if (!apiKey) {
    return { configured: false, reachable: false, latencyMs: null, error: 'missing_api_key' };
  }

  const result = await timedFetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify({
      query: 'AAPL earnings',
      numResults: 1
    })
  });

  return {
    configured: true,
    reachable: result.ok,
    latencyMs: result.latencyMs,
    error: result.error
  };
}

export async function getProviderDiagnostics(): Promise<ProviderDiagnostics> {
  const [openrouter, financialDatasets, exasearch] = await Promise.all([
    probeOpenRouter(),
    probeFinancialDatasets(),
    probeExaSearch()
  ]);

  pushHistory('openrouter', openrouter);
  pushHistory('financialDatasets', financialDatasets);
  pushHistory('exasearch', exasearch);

  return {
    timestamp: new Date().toISOString(),
    mode: process.env.FINMIND_AGENT_MODE ?? 'mock',
    providers: {
      openrouter,
      financialDatasets,
      exasearch
    },
    history: {
      openrouter: [...diagnosticsHistory.openrouter],
      financialDatasets: [...diagnosticsHistory.financialDatasets],
      exasearch: [...diagnosticsHistory.exasearch]
    }
  };
}
