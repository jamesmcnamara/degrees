import { DiaryEntry } from "@/components/DiaryEntry";
import { chronologicalDiary, formatDiaryDate } from "@/lib/diary";
import { useGraph } from "@/lib/store";
import { useState } from "react";

export function Diary() {
  const graph = useGraph();
  const entries = chronologicalDiary(graph.movies);
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const filteredEntries = query
    ? entries.filter((entry) =>
        [
          entry.movie.name,
          entry.text,
          entry.date,
          formatDiaryDate(entry.date),
        ].some((value) => value.toLowerCase().includes(query)),
      )
    : entries;

  if (entries.length === 0) {
    return <p className="muted">No diary entries yet.</p>;
  }

  return (
    <div className="diary">
      <input
        type="search"
        className="diary__filter"
        placeholder="Filter diary entries…"
        aria-label="Filter diary entries"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      {filteredEntries.length > 0 ? (
        filteredEntries.map((entry) => (
          <DiaryEntry key={`${entry.movie.id}:${entry.date}`} entry={entry} />
        ))
      ) : (
        <p className="muted">No diary entries match this filter.</p>
      )}
    </div>
  );
}
