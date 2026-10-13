import { describe, expect, it } from 'vitest';
import { toIso } from './time';

describe('toIso', () => {
  it('сохраняет миллисекунды только когда они есть', () => {
    expect(toIso(Date.UTC(2026, 9, 13, 20, 9, 5, 335), 'Europe/Moscow')).toBe('2026-10-13T23:09:05.335+03:00');
    expect(toIso(Date.UTC(2026, 9, 13, 21, 0, 0, 0), 'Europe/Moscow')).toBe('2026-10-14T00:00:00+03:00');
  });
});
