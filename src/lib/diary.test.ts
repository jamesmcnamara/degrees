import { expect, test } from 'bun:test';
import { chronologicalDiary, diaryDateFor } from './diary';
import type { Movie } from './types';

test('diary day changes at 6am local time', () => {
  expect(diaryDateFor(new Date(2026, 6, 28, 5, 59))).toBe('2026-07-27');
  expect(diaryDateFor(new Date(2026, 6, 28, 6, 0))).toBe('2026-07-28');
});

test('chronologicalDiary sorts newest entries first', () => {
  const movies: Record<string, Movie> = {
    a: {
      id: 'a',
      name: 'First',
      diary: [
        { date: '2026-07-27', text: 'Older' },
        { date: '2026-07-28', text: 'Newest' }
      ]
    },
    b: {
      id: 'b',
      name: 'Second',
      diary: [{ date: '2026-07-26', text: 'Oldest' }]
    }
  };

  expect(chronologicalDiary(movies).map((entry) => entry.text)).toEqual([
    'Newest',
    'Older',
    'Oldest'
  ]);
});
