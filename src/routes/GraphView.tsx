/**
 * The game: pick a start and end movie, then see whether (and how) they are
 * connected. The bipartite graph is projected onto movies and the shortest
 * path is highlighted in the Cytoscape view and listed as an actor chain.
 */

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import type { Id } from "@/lib/types";
import {
  localSource,
  type Suggestion,
  type SuggestionSource,
} from "@/lib/suggestions";
import { useGraph } from "@/lib/store";
import { Autocomplete } from "@/components/Autocomplete";
import { MovieGraph } from "@/components/MovieGraph";
import type { Graph, PathResult } from "@/lib/graph";

export function GraphView() {
  const graph = useGraph();
  const [, navigate] = useLocation();
  const [start, setStart] = useState<Id | null>(null);
  const [end, setEnd] = useState<Id | null>(null);

  const startSource = useMemo(
    () => localSource(graph, "movie", new Set([end].filter(Boolean) as Id[])),
    [graph, end],
  );
  const endSource = useMemo(
    () => localSource(graph, "movie", new Set([start].filter(Boolean) as Id[])),
    [graph, start],
  );

  const path = useMemo(
    () => (start && end ? graph.shortestPath(start, end) : null),
    [graph, start, end],
  );

  const pickInto = (setter: (id: Id | null) => void) => (s: Suggestion) => {
    if (s.id) setter(s.id);
  };

  return (
    <div className="graph-view">
      <div className="picker">
        <MoviePicker
          label="Start"
          movieId={start}
          name={start ? graph.movies[start]?.name : undefined}
          source={startSource}
          onPick={pickInto(setStart)}
          onClear={() => setStart(null)}
        />
        <MoviePicker
          label="End"
          movieId={end}
          name={end ? graph.movies[end]?.name : undefined}
          source={endSource}
          onPick={pickInto(setEnd)}
          onClear={() => setEnd(null)}
        />
      </div>

      {start && end && <Result graph={graph} path={path} navigate={navigate} />}

      <MovieGraph
        graph={graph}
        path={path}
        onSelectMovie={(id) => {
          if (!start) setStart(id);
          else if (!end && id !== start) setEnd(id);
        }}
      />
    </div>
  );
}

interface MoviePickerProps {
  label: string;
  movieId: Id | null;
  name: string | undefined;
  source: SuggestionSource;
  onPick: (s: Suggestion) => void;
  onClear: () => void;
}

function MoviePicker({
  label,
  movieId,
  name,
  source,
  onPick,
  onClear,
}: MoviePickerProps) {
  return (
    <div className="picker__field">
      <span className="picker__label">{label}</span>
      {movieId ? (
        <button type="button" className="chip chip--solid" onClick={onClear}>
          {name ?? "?"} <span className="chip__remove">×</span>
        </button>
      ) : (
        <Autocomplete
          source={source}
          onPick={onPick}
          placeholder="Pick a movie…"
          aria-label="Pick a movie…"
        />
      )}
    </div>
  );
}

interface ResultProps {
  graph: Graph;
  path: PathResult | null;
  navigate: (to: string) => void;
}

function Result({ graph, path, navigate }: ResultProps) {
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
              {graph.movies[movieId]?.name}
            </button>
            {i < path.actors.length && (
              <button
                type="button"
                className="chain__actor"
                onClick={() => navigate(`/actor/${path.actors[i]}`)}
              >
                ↓ {graph.actors[path.actors[i]!]?.name}
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
