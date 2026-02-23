type RetryOptions = {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  multiplier?: number;
};

type CircuitBreakerOptions = {
  failureThreshold?: number;
  resetTimeoutMs?: number;
};

type CircuitState = 'closed' | 'open' | 'half-open';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const multiplier = options.multiplier ?? 2;

  let attempt = 0;
  let delay = initialDelayMs;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        break;
      }

      await sleep(delay);
      delay = Math.min(maxDelayMs, delay * multiplier);
      attempt += 1;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('retry_exhausted');
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastOpenedAtMs: number | null = null;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 60_000;
  }

  getState(): CircuitState {
    return this.state;
  }

  reset() {
    this.state = 'closed';
    this.failureCount = 0;
    this.lastOpenedAtMs = null;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const now = Date.now();
      if (!this.lastOpenedAtMs || now - this.lastOpenedAtMs < this.resetTimeoutMs) {
        throw new Error('circuit_open');
      }
      this.state = 'half-open';
    }

    try {
      const result = await fn();
      this.reset();
      return result;
    } catch (error) {
      this.failureCount += 1;

      if (this.failureCount >= this.failureThreshold || this.state === 'half-open') {
        this.state = 'open';
        this.lastOpenedAtMs = Date.now();
      }

      throw error;
    }
  }
}

const namedBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, options: CircuitBreakerOptions = {}): CircuitBreaker {
  const existing = namedBreakers.get(name);
  if (existing) {
    return existing;
  }

  const created = new CircuitBreaker(options);
  namedBreakers.set(name, created);
  return created;
}
