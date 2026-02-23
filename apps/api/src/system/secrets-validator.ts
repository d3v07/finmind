import type { SecretValidation } from '@finmind/shared';

function getEnv(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function validateOpenRouter(value: string): 'valid' | 'missing' | 'invalid' {
  if (!value) {
    return 'missing';
  }
  return value.length >= 20 ? 'valid' : 'invalid';
}

function validateFinancialDatasets(value: string): 'valid' | 'missing' | 'invalid' {
  if (!value) {
    return 'missing';
  }
  return value.length >= 10 ? 'valid' : 'invalid';
}

function validateExa(value: string): 'valid' | 'missing' | 'invalid' {
  if (!value) {
    return 'missing';
  }
  return value.length >= 10 ? 'valid' : 'invalid';
}

function validateJwt(value: string): 'valid' | 'missing' | 'invalid' {
  if (!value) {
    return 'missing';
  }
  if (value === 'finmind-dev-secret-change-this' || value.length < 16) {
    return 'invalid';
  }
  return 'valid';
}

export function getSecretValidation(): SecretValidation {
  const openrouter = validateOpenRouter(getEnv('OPENROUTER_API_KEY'));
  const financial = validateFinancialDatasets(getEnv('FINANCIAL_DATASETS_API_KEY'));
  const exa = validateExa(getEnv('EXASEARCH_API_KEY') || getEnv('EXA_API_KEY'));
  const jwt = validateJwt(getEnv('JWT_SECRET'));

  const items = [
    {
      key: 'OPENROUTER_API_KEY',
      required: true,
      status: openrouter,
      message:
        openrouter === 'valid'
          ? 'Configured'
          : openrouter === 'missing'
            ? 'Missing required key'
            : 'Key format seems invalid'
    },
    {
      key: 'FINANCIAL_DATASETS_API_KEY',
      required: true,
      status: financial,
      message:
        financial === 'valid'
          ? 'Configured'
          : financial === 'missing'
            ? 'Missing required key'
            : 'Key format seems invalid'
    },
    {
      key: 'EXASEARCH_API_KEY',
      required: false,
      status: exa,
      message:
        exa === 'valid'
          ? 'Configured'
          : exa === 'missing'
            ? 'Optional key missing (web augmentation reduced)'
            : 'Key format seems invalid'
    },
    {
      key: 'JWT_SECRET',
      required: true,
      status: jwt,
      message:
        jwt === 'valid'
          ? 'Configured'
          : jwt === 'missing'
            ? 'Missing required secret'
            : 'Weak/invalid secret (min 16 chars; avoid default)'
    }
  ] as const;

  const criticalReady = items
    .filter((item) => item.required)
    .every((item) => item.status === 'valid');

  return {
    criticalReady,
    checkedAt: new Date().toISOString(),
    items: [...items]
  };
}
