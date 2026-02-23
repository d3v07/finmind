import { describe, expect, test } from 'bun:test';
import { abbreviateId } from './utils.js';

describe('utils', () => {
  test('abbreviates long ids', () => {
    expect(abbreviateId('1234567890abcdef')).toBe('123456...cdef');
  });

  test('keeps short ids unchanged', () => {
    expect(abbreviateId('12345')).toBe('12345');
  });
});
