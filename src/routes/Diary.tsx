import { chronologicalDiary, formatDiaryDate } from '@/lib/diary';
import { useGraph } from '@/lib/store';
import { Link } from 'wouter';

export function Diary() {
  const graph = useGraph();
  const entries = chronologicalDiary(graph.movies);

  if (entries.length === 0) {
    return <p className="muted">No diary entries yet.</p>;
  }

  return (
    <div className="diary">
      {entries.map((entry) => (
        <article
          key={`${entry.movie.id}:${entry.date}`}
          className="diary-entry"
        >
          <header className="diary-entry__header">
            <Link
              href={`/movie/${entry.movie.id}`}
              className="diary-entry__movie"
            >
              {entry.movie.name}
            </Link>
            <time className="diary-entry__date" dateTime={entry.date}>
              {formatDiaryDate(entry.date)}
            </time>
          </header>
          <p className="diary-entry__text">{entry.text}</p>
        </article>
      ))}
    </div>
  );
}
