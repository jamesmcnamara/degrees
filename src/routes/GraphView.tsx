/**
 * The game: pick a start and end movie, then see whether (and how) they are
 * connected. The bipartite graph is projected onto movies and the shortest
 * path is highlighted in the Cytoscape view and listed as an actor chain.
 */

import { useMemo, useState } from "react";
import type { EntityKind, Id } from "@/lib/types";
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
  const [start, setStart] = useState<Id | null>(null);
  const [end, setEnd] = useState<Id | null>(null);

  // A local, working copy of the graph with movies excluded by the user
  // while exploring alternate routes. `null` means no exclusions yet — the
  // original graph is used as-is. Never persisted; resets on navigation.
  const [workingGraph, setWorkingGraph] = useState<Graph | null>(null);

  // Drop any local exclusions if the underlying graph changes (e.g. edits
  // made elsewhere), so we never operate on stale data.
  const activeGraph = workingGraph ?? graph;

  const startSource = useMemo(
    () =>
      localSource(activeGraph, "movie", new Set([end].filter(Boolean) as Id[])),
    [activeGraph, end],
  );
  const endSource = useMemo(
    () =>
      localSource(
        activeGraph,
        "movie",
        new Set([start].filter(Boolean) as Id[]),
      ),
    [activeGraph, start],
  );

  const path = useMemo(
    () => (start && end ? activeGraph.shortestPath(start, end) : null),
    [activeGraph, start, end],
  );

  const pickInto = (setter: (id: Id | null) => void) => (s: Suggestion) => {
    if (s.id) setter(s.id);
  };

  const reset = () => {
    setStart(null);
    setEnd(null);
    setWorkingGraph(null);
  };

  const exclude = (dropper: DropId) => {
    const next = activeGraph.clone();
    next.delete(dropper.kind, dropper.id);
    setWorkingGraph(next);
  };

  return (
    <div className="graph-view">
      <div className="picker">
        <MoviePicker
          label="Start"
          movieId={start}
          name={start ? activeGraph.movies[start]?.name : undefined}
          source={startSource}
          onPick={pickInto(setStart)}
          onClear={reset}
        />
        <MoviePicker
          label="End"
          movieId={end}
          name={end ? activeGraph.movies[end]?.name : undefined}
          source={endSource}
          onPick={pickInto(setEnd)}
          onClear={() => {
            setEnd(null);
            setWorkingGraph(null);
          }}
        />
      </div>
      {workingGraph && (
        <div className="exclusions">
          <button
            type="button"
            className="exclusions__reset"
            onClick={() => setWorkingGraph(null)}
          >
            Reset graph
          </button>
        </div>
      )}
      {start && end && (
        <Result graph={activeGraph} path={path} exclude={exclude} />
      )}
      <MovieGraph
        graph={activeGraph}
        path={path}
        onSelectMovie={(id) => {
          if (!start) {
            setStart(id);
          } else if (!end && id !== start) {
            setEnd(id);
          }
        }}
      />
    </div>
  );
}

interface DropId {
  kind: EntityKind;
  id: Id;
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
  exclude(id: DropId): void;
}

function Result({ graph, path, exclude }: ResultProps) {
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
              onClick={() => exclude({ kind: "movie", id: movieId })}
            >
              {graph.movies[movieId]?.name}
            </button>
            {i < path.actors.length && (
              <button
                type="button"
                className="chain__actor"
                onClick={() => exclude({ kind: "actor", id: path.actors[i]! })}
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
