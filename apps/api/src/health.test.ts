import { describe, expect, test } from 'bun:test';
import { getHealthStatus } from './health.js';

describe('health', () => {
  test('returns ok', () => {
    expect(getHealthStatus()).toEqual({ status: 'ok' });
  });
});
