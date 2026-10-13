import { describe, expect, it } from 'vitest';
import { ApiError, formatApiError, shouldRetryRequest } from './client';
import { allCursorItems } from './endpoints';

describe('общая обработка API', () => {
  it('не повторяет детерминированные 4xx, но ограниченно повторяет сеть, 429 и 5xx', () => {
    expect(shouldRetryRequest(0, new ApiError(422))).toBe(false);
    expect(shouldRetryRequest(0, new ApiError(429))).toBe(true);
    expect(shouldRetryRequest(1, new ApiError(503))).toBe(true);
    expect(shouldRetryRequest(2, new ApiError(503))).toBe(false);
    expect(shouldRetryRequest(0, new TypeError('network failed'))).toBe(true);
    expect(shouldRetryRequest(2, new TypeError('network failed'))).toBe(false);
  });

  it('показывает безопасный русский текст и traceId вместо технического сообщения', () => {
    const error = new ApiError(500, {
      code: 'INTERNAL_ERROR',
      message: 'SQLException: password=secret',
      traceId: 'trace-42',
      fieldErrors: [],
      details: {},
    });
    expect(formatApiError(error)).toBe('На сервере произошла ошибка · код обращения trace-42');
  });

  it('объединяет все cursor-страницы без потерь и не маскирует ошибку', async () => {
    const source = Array.from({ length: 1_203 }, (_, id) => id);
    const result = await allCursorItems(async (cursor) => {
      const offset = Number(cursor ?? 0);
      const items = source.slice(offset, offset + 500);
      const next = offset + items.length;
      return { items, cursor: { hasMore: next < source.length, nextCursor: next < source.length ? String(next) : null } };
    });
    expect(result).toEqual(source);

    const failure = new ApiError(503);
    await expect(allCursorItems(async () => { throw failure; })).rejects.toBe(failure);
  });
});
