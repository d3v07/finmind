import { describe, expect, test } from 'bun:test';
import { buildAppBanner } from '@finmind/shared';

describe('web bootstrap', () => {
  test('builds startup banner', () => {
    expect(buildAppBanner('FinMind')).toBe('FinMind ready');
  });
});
