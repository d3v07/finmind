import { describe, expect, test } from 'bun:test';
import { buildAppBanner, createSessionInputSchema, registerInputSchema } from './index.js';

describe('shared', () => {
  test('banner helper', () => {
    expect(buildAppBanner('FinMind')).toBe('FinMind ready');
  });

  test('register schema validates', () => {
    const parsed = registerInputSchema.parse({
      email: 'user@example.com',
      name: 'Test User',
      password: 'strongpass123'
    });

    expect(parsed.email).toBe('user@example.com');
  });

  test('create session schema validates', () => {
    const parsed = createSessionInputSchema.parse({ title: 'My Session' });
    expect(parsed.title).toBe('My Session');
  });
});
