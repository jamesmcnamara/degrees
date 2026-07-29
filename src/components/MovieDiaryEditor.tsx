import { diaryDateFor, formatDiaryDate, isDiaryDate } from '@/lib/diary';
import * as store from '@/lib/store';
import { useGraph } from '@/lib/store';
import type { Id } from '@/lib/types';
import { useState } from 'react';

interface MovieDiaryEditorProps {
  movieId: Id | null;
  movieName: string;
  ensureMovie: () => Id | null;
}

export function MovieDiaryEditor({
  movieId,
  movieName,
  ensureMovie
}: MovieDiaryEditorProps) {
  const graph = useGraph();
  const [diaryDate, setDiaryDate] = useState(diaryDateFor);
  const [diaryDateDraft, setDiaryDateDraft] = useState(diaryDate);
  const [editingDiaryDate, setEditingDiaryDate] = useState(false);
  const [diaryDateError, setDiaryDateError] = useState<string | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const movie = movieId ? graph.movies[movieId] : undefined;
  const diaryText = movie
    ? (movie.diary?.find((entry) => entry.date === diaryDate)?.text ?? '')
    : '';
  const today = diaryDateFor();
  const historicalEntries = (movie?.diary ?? [])
    .filter((entry) => entry.date < today && entry.date !== diaryDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  const updateDiary = (text: string) => {
    const id = ensureMovie();
    if (id) store.setDiaryEntry(id, diaryDate, text);
  };

  const editDiaryDate = () => {
    setDiaryDateDraft(diaryDate);
    setDiaryDateError(null);
    setEditingDiaryDate(true);
  };

  const commitDiaryDate = () => {
    const nextDate = diaryDateDraft.trim();
    if (!isDiaryDate(nextDate)) {
      setDiaryDateError('Enter a valid date as YYYY-MM-DD.');
      return;
    }
    setDiaryDate(nextDate);
    setDiaryDateDraft(nextDate);
    setDiaryDateError(null);
    setEditingDiaryDate(false);
    setExpandedDate(null);
  };

  const cancelDiaryDateEdit = () => {
    setDiaryDateDraft(diaryDate);
    setDiaryDateError(null);
    setEditingDiaryDate(false);
  };

  return (
    <section className="field diary-editor">
      <div className="field__label diary-editor__label">
        <label htmlFor="diary-text">Diary ·</label>
        {editingDiaryDate ? (
          <input
            className="diary-editor__date-input"
            type="text"
            value={diaryDateDraft}
            onChange={(event) => {
              setDiaryDateDraft(event.target.value);
              setDiaryDateError(null);
            }}
            onBlur={commitDiaryDate}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitDiaryDate();
              } else if (event.key === 'Escape') {
                cancelDiaryDateEdit();
              }
            }}
            inputMode="numeric"
            placeholder="YYYY-MM-DD"
            aria-label="Diary date"
            aria-invalid={diaryDateError ? true : undefined}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="diary-editor__date"
            onClick={editDiaryDate}
            aria-label="Change diary date"
          >
            {formatDiaryDate(diaryDate)}
          </button>
        )}
      </div>
      {diaryDateError && (
        <span className="field__error">{diaryDateError}</span>
      )}
      <textarea
        id="diary-text"
        className="field__input diary-editor__input"
        value={diaryText}
        placeholder={
          movieName.trim()
            ? 'Write about this viewing…'
            : 'Add a title before writing…'
        }
        onChange={(event) => updateDiary(event.target.value)}
        disabled={!movieName.trim()}
      />

      {historicalEntries.length > 0 && (
        <div className="diary-history">
          <h3 className="diary-history__heading">Previous entries</h3>
          <div className="diary-history__entries">
            {historicalEntries.map((entry) => {
              const expanded = expandedDate === entry.date;
              const contentId = `diary-entry-${entry.date}`;
              return (
                <section key={entry.date} className="diary-history__entry">
                  <button
                    type="button"
                    className="diary-history__date"
                    onClick={() =>
                      setExpandedDate(expanded ? null : entry.date)
                    }
                    aria-expanded={expanded}
                    aria-controls={contentId}
                  >
                    {formatDiaryDate(entry.date)}
                  </button>
                  {expanded && (
                    <textarea
                      id={contentId}
                      className="field__input diary-history__input"
                      value={entry.text}
                      onChange={(event) => {
                        if (movieId) {
                          store.setDiaryEntry(
                            movieId,
                            entry.date,
                            event.target.value
                          );
                        }
                      }}
                      aria-label={`Diary entry for ${formatDiaryDate(entry.date)}`}
                    />
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
