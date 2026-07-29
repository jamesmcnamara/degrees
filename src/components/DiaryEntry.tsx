import { formatDiaryDate, type MovieDiaryEntry } from '@/lib/diary';
import { useState } from 'react';
import { Link } from 'wouter';

interface DiaryEntryProps {
  entry: MovieDiaryEntry;
}

export function DiaryEntry({ entry }: DiaryEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = `diary-entry-${entry.movie.id}-${entry.date}`;

  return (
    <article className="diary-entry">
      <header className="diary-entry__header">
        <Link
          href={`/movie/${entry.movie.id}`}
          className="diary-entry__movie"
        >
          {entry.movie.name}
        </Link>
        <button
          type="button"
          className="diary-entry__toggle"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-controls={contentId}
        >
          <time className="diary-entry__date" dateTime={entry.date}>
            {formatDiaryDate(entry.date)}
          </time>
          <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button>
      </header>
      {expanded && (
        <p id={contentId} className="diary-entry__text">
          {entry.text}
        </p>
      )}
    </article>
  );
}
