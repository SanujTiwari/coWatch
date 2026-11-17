import { describe, expect, it } from 'vitest';
import { mergeMessages } from '../lib/chat';

describe('message history reconciliation', () => {
  it('deduplicates received messages and restores missed messages in chronological order', () => {
    const first = { id: '1', createdAt: '2025-01-01T10:00:00Z' };
    const second = { id: '2', createdAt: '2025-01-01T10:01:00Z' };
    const third = { id: '3', createdAt: '2025-01-01T10:02:00Z' };
    expect(mergeMessages([third, first], [first, second])).toEqual([first, second, third]);
  });
});
