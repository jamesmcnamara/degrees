/**
 * The game: pick a start and end movie, then see whether (and how) they are
 * connected. The bipartite graph is projected onto movies and the shortest
 * path is highlighted in the Cytoscape view and listed as an actor chain.
 */

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import type { Id } from "@/lib/types";
import { shortestPath } from "@/lib/graph";
import { localSource, type Suggestion } from "@/lib/suggestions";
import { useGraph } from "@/lib/store";
import { Autocomplete } from "@/components/Autocomplete";
import { MovieGraph } from "@/components/MovieGraph";

export function GraphView() {
  const data = useGraph();
  const [, navigate] = useLocation();
  const [start, setStart] = useState<Id | null>(null);
  const [end, setEnd] = useState<Id | null>(null);

  const startSource = useMemo(
    () => localSource(data, "movie", new Set([end].filter(Boolean) as Id[])),
    [data, end],
  );
  const endSource = useMemo(
    () => localSource(data, "movie", new Set([start].filter(Boolean) as Id[])),
    [data, start],
  );

  const path = useMemo(
    () => (start && end ? shortestPath(data, start, end) : null),
    [data, start, end],
  );

  const pickInto =
    (setter: (id: Id | null) => void) => (s: Suggestion) => {
      if (s.id) setter(s.id);
    };

  return (
    <div className="graph-view">
      <div className="picker">
        <MoviePicker
          label="Start"
          movieId={start}
          name={start ? data.movies[start]?.name : undefined}
          source={startSource}
          onPick={pickInto(setStart)}
          onClear={() => setStart(null)}
        />
        <MoviePicker
          label="End"
          movieId={end}
          name={end ? data.movies[end]?.name : undefined}
          source={endSource}
          onPick={pickInto(setEnd)}
          onClear={() => setEnd(null)}
        />
      </div>

      {start && end && (
        <Result data={data} path={path} navigate={navigate} />
      )}

      <MovieGraph
        data={data}
        path={path}
        onSelectMovie={(id) => {
          if (!start) setStart(id);
          else if (!end && id !== start) setEnd(id);
        }}
      />
    </div>
  );
}

function MoviePicker({
  label,
  movieId,
  name,
  source,
  onPick,
  onClear,
}: {
  label: string;
  movieId: Id | null;
  name: string | undefined;
  source: ReturnType<typeof localSource>;
  onPick: (s: Suggestion) => void;
  onClear: () => void;
}) {
  return (
    <div className="picker__field">
      <span className="picker__label">{label}</span>
      {movieId ? (
        <button type="button" className="chip chip--solid" onClick={onClear}>
          {name ?? "?"} <span className="chip__remove">×</span>
        </button>
      ) : (
        <Autocomplete source={source} onPick={onPick} placeholder="Pick a movie…" />
      )}
    </div>
  );
}

function Result({
  data,
  path,
  navigate,
}: {
  data: ReturnType<typeof useGraph>;
  path: ReturnType<typeof shortestPath>;
  navigate: (to: string) => void;
}) {
  if (!path) {
    return (
      <div className="result result--none">No connection found (yet).</div>
    );
  }

  const degrees = path.actors.length;
  return (
    <div className="result">
      <div className="result__degrees">
        {degrees} {degrees === 1 ? "degree" : "degrees"} of separation
      </div>
      <div className="chain">
        {path.movies.map((movieId, i) => (
          <span key={movieId} className="chain__step">
            <button
              type="button"
              className="chain__movie"
              onClick={() => navigate(`/movie/${movieId}`)}
            >
              {data.movies[movieId]?.name}
            </button>
            {i < path.actors.length && (
              <button
                type="button"
                className="chain__actor"
                onClick={() => navigate(`/actor/${path.actors[i]}`)}
              >
                ↓ {data.actors[path.actors[i]!]?.name}
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
