import type { DiaryEntry, Movie } from './types';

const DIARY_DAY_START_HOUR = 6;

/** Return the local diary day, whose boundary is 6am rather than midnight. */
export const diaryDateFor = (now = new Date()): string => {
  const shifted = new Date(now);
  shifted.setHours(shifted.getHours() - DIARY_DAY_START_HOUR);
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatDiaryDate = (date: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'long'
  }).format(new Date(`${date}T12:00:00`));

export interface MovieDiaryEntry extends DiaryEntry {
  movie: Movie;
}

export const chronologicalDiary = (
  movies: Record<string, Movie>
): MovieDiaryEntry[] =>
  Object.values(movies)
    .flatMap(
      (movie) => movie.diary?.map((entry) => ({ ...entry, movie })) ?? []
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || a.movie.name.localeCompare(b.movie.name)
    );
