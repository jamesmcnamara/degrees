import { diaryDateFor, formatDiaryDate } from "@/lib/diary";
import * as store from "@/lib/store";
import { useGraph } from "@/lib/store";
import type { Id } from "@/lib/types";
import { useState } from "react";
import { DateEntry } from "./DateEntry";

interface MovieDiaryEditorProps {
  movieId: Id | null;
  movieName: string;
  ensureMovie: () => Id | null;
}

export function MovieDiaryEditor({
  movieId,
  movieName,
  ensureMovie,
}: MovieDiaryEditorProps) {
  const graph = useGraph();
  const [diaryDate, setDiaryDate] = useState(diaryDateFor);
  const [isEditingDiaryDate, setIsEditingDiaryDate] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const [isMusing, setIsMusing] = useState(false);
  const [musing, setMusing] = useState("");

  const movie = movieId ? graph.movies[movieId] : undefined;
  const diaryText = movie
    ? (movie.diary?.find((entry) => entry.date === diaryDate)?.text ?? "")
    : "";
  const today = diaryDateFor();
  const historicalEntries = (movie?.diary ?? [])
    .filter((entry) => entry.date < today && entry.date !== diaryDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  const updateDiary = (text: string) => {
    const id = ensureMovie();
    if (id) store.setDiaryEntry(id, diaryDate, text);
  };

  function setDate(date: string) {
    setDiaryDate(date);
    setIsEditingDiaryDate(false);
  }

  function muse() {
    if (isMusing) {
      updateDiary(`${diaryText.trim()}${diaryText ? "\n\n" : ""}${musing}`);
      setMusing("");
      setIsMusing(false);
    } else {
      setIsMusing(true);
      setMusing("");
    }
  }

  return (
    <section className="field diary-editor">
      <div className="field__label diary-editor__label">
        <label htmlFor="diary-text">Diary ·</label>
        {isEditingDiaryDate ? (
          <DateEntry date={diaryDate} setDate={setDate} />
        ) : (
          <button
            type="button"
            className="diary-editor__date"
            onClick={() => setIsEditingDiaryDate(true)}
            aria-label="Change diary date"
          >
            {formatDiaryDate(diaryDate)}
          </button>
        )}
      </div>
      <textarea
        id="diary-text"
        className="field__input diary-editor__input"
        value={diaryText}
        placeholder="Tell me your highdeas…"
        aria-label="Tell me your highdeas…"
        onChange={(event) => updateDiary(event.target.value)}
        disabled={!movieName.trim()}
      />
      {isMusing && (
        <textarea
          className="field__input diary-editor__input--musing"
          value={musing}
          onChange={(event) => setMusing(event.target.value)}
          placeholder="Share your musing…"
          aria-label="Share your musing…"
          autoFocus
        />
      )}
      <button type="button" className="btn btn--action" onClick={muse}>
        {isMusing ? "Mischief Managed" : "Add Musing"}
      </button>

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
                            event.target.value,
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
