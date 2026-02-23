import type { QueryUsage } from '@finmind/shared';

type CostInputs = {
  inputTokens: number;
  outputTokens: number;
  financialCalls: number;
  exaCalls: number;
};

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const OPENROUTER_INPUT_COST_PER_1K = () =>
  numberFromEnv('FINMIND_OPENROUTER_INPUT_COST_PER_1K', 0.00015);
const OPENROUTER_OUTPUT_COST_PER_1K = () =>
  numberFromEnv('FINMIND_OPENROUTER_OUTPUT_COST_PER_1K', 0.0006);
const FINANCIAL_CALL_COST = () => numberFromEnv('FINMIND_FINANCIAL_CALL_COST', 0.001);
const EXA_CALL_COST = () => numberFromEnv('FINMIND_EXA_CALL_COST', 0.1);

export function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

export function buildUsageSummary(inputs: CostInputs): QueryUsage {
  const openrouter =
    (inputs.inputTokens / 1000) * OPENROUTER_INPUT_COST_PER_1K() +
    (inputs.outputTokens / 1000) * OPENROUTER_OUTPUT_COST_PER_1K();
  const financial = inputs.financialCalls * FINANCIAL_CALL_COST();
  const exa = inputs.exaCalls * EXA_CALL_COST();

  return {
    tokenCount: inputs.inputTokens + inputs.outputTokens,
    inputTokens: inputs.inputTokens,
    outputTokens: inputs.outputTokens,
    estimatedCost: round4(openrouter + financial + exa),
    costBreakdown: {
      openrouter: round4(openrouter),
      financial: round4(financial),
      exa: round4(exa)
    }
  };
}

export function inferToolCosts(
  toolCalls: Array<{ tool: string; args: Record<string, unknown>; result: string }> | undefined
): { financialCalls: number; exaCalls: number } {
  if (!toolCalls || toolCalls.length === 0) {
    return { financialCalls: 0, exaCalls: 0 };
  }

  let financialCalls = 0;
  let exaCalls = 0;

  for (const call of toolCalls) {
    const toolName = call.tool.toLowerCase();

    if (toolName.includes('web_search') || toolName.includes('exa')) {
      exaCalls += 1;
    } else if (
      toolName.includes('financial') ||
      toolName.includes('price') ||
      toolName.includes('income') ||
      toolName.includes('balance') ||
      toolName.includes('cash') ||
      toolName.includes('filings') ||
      toolName.includes('ratio')
    ) {
      financialCalls += 1;
    }
  }

  return { financialCalls, exaCalls };
}

export function estimateQueryCostFromPrompt(
  prompt: string,
  mode: 'guided' | 'advanced',
  verbosity: 'short' | 'standard' | 'deep'
): number {
  const inputTokens = estimateTokensFromText(prompt);
  const multiplier = mode === 'guided' ? 1.4 : verbosity === 'deep' ? 4.5 : verbosity === 'standard' ? 2.8 : 1.8;
  const outputTokens = Math.ceil(inputTokens * multiplier);
  const usage = buildUsageSummary({
    inputTokens,
    outputTokens,
    financialCalls: mode === 'guided' ? 1 : 2,
    exaCalls: mode === 'guided' ? 0 : 1
  });

  return usage.estimatedCost;
}
