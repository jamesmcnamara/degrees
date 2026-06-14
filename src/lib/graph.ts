/**
 * Pure, immutable operations over `GraphData`.
 *
 * The data is a bipartite graph (movies <-> actors joined by appearances).
 * The "game" view projects it onto movies-only, where two movies are linked
 * when they share an actor.
 */

import type { Appearance, EntityKind, GraphData, Id } from "./types";
import { newId } from "./id";

export const emptyGraph = (): GraphData => ({
  movies: {},
  actors: {},
  appearances: [],
});

const collection = (data: GraphData, kind: EntityKind) =>
  kind === "movie" ? data.movies : data.actors;

/** Look up an existing entity of `kind` by case-insensitive name. */
export const findByName = (
  data: GraphData,
  kind: EntityKind,
  name: string,
): Id | undefined => {
  const target = name.trim().toLowerCase();
  return Object.values(collection(data, kind)).find(
    (e) => e.name.toLowerCase() === target,
  )?.id;
};

/** Create the entity if it doesn't already exist; return [next, id]. */
export const upsertEntity = (
  data: GraphData,
  kind: EntityKind,
  name: string,
): [GraphData, Id] => {
  const trimmed = name.trim();
  const existing = findByName(data, kind, trimmed);
  if (existing) return [data, existing];

  const id = newId();
  const key = kind === "movie" ? "movies" : "actors";
  return [
    { ...data, [key]: { ...data[key], [id]: { id, name: trimmed } } },
    id,
  ];
};

/** Rename an existing entity. */
export const renameEntity = (
  data: GraphData,
  kind: EntityKind,
  id: Id,
  name: string,
): GraphData => {
  const key = kind === "movie" ? "movies" : "actors";
  const entity = data[key][id];
  if (!entity) return data;
  return { ...data, [key]: { ...data[key], [id]: { ...entity, name: name.trim() } } };
};

/** Remove an entity and any appearances that reference it. */
export const deleteEntity = (
  data: GraphData,
  kind: EntityKind,
  id: Id,
): GraphData => {
  const key = kind === "movie" ? "movies" : "actors";
  const { [id]: _removed, ...rest } = data[key];
  const field = kind === "movie" ? "movieId" : "actorId";
  return {
    ...data,
    [key]: rest,
    appearances: data.appearances.filter((a) => a[field] !== id),
  };
};

const hasAppearance = (data: GraphData, movieId: Id, actorId: Id) =>
  data.appearances.some((a) => a.movieId === movieId && a.actorId === actorId);

/** Connect a movie and an actor (no-op if already connected). */
export const linkAppearance = (
  data: GraphData,
  movieId: Id,
  actorId: Id,
): GraphData =>
  hasAppearance(data, movieId, actorId)
    ? data
    : { ...data, appearances: [...data.appearances, { movieId, actorId }] };

/** Remove the edge between a movie and an actor. */
export const unlinkAppearance = (
  data: GraphData,
  movieId: Id,
  actorId: Id,
): GraphData => ({
  ...data,
  appearances: data.appearances.filter(
    (a) => !(a.movieId === movieId && a.actorId === actorId),
  ),
});

/** Ids of entities linked to `id` (the opposite kind). */
export const relatedIds = (
  data: GraphData,
  kind: EntityKind,
  id: Id,
): Id[] =>
  kind === "movie"
    ? data.appearances.filter((a) => a.movieId === id).map((a) => a.actorId)
    : data.appearances.filter((a) => a.actorId === id).map((a) => a.movieId);

// ---------------------------------------------------------------------------
// Movie projection + pathfinding
// ---------------------------------------------------------------------------

const pushTo = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
};

interface Adjacency {
  movieActors: Map<Id, Id[]>;
  actorMovies: Map<Id, Id[]>;
}

const buildAdjacency = (data: GraphData): Adjacency => {
  const movieActors = new Map<Id, Id[]>();
  const actorMovies = new Map<Id, Id[]>();
  for (const { movieId, actorId } of data.appearances) {
    pushTo(movieActors, movieId, actorId);
    pushTo(actorMovies, actorId, movieId);
  }
  return { movieActors, actorMovies };
};

const pairKey = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** An edge in the movie-only projection, labelled by the shared actor(s). */
export interface ProjectionEdge {
  source: Id;
  target: Id;
  actorIds: Id[];
}

/** Build movie-vs-movie edges (one per pair, listing every shared actor). */
export const movieProjection = (data: GraphData): ProjectionEdge[] => {
  const { actorMovies } = buildAdjacency(data);
  const edges = new Map<string, ProjectionEdge>();
  for (const [actorId, movies] of actorMovies) {
    for (let i = 0; i < movies.length; i++) {
      for (let j = i + 1; j < movies.length; j++) {
        const a = movies[i]!;
        const b = movies[j]!;
        const key = pairKey(a, b);
        const edge = edges.get(key);
        if (edge) edge.actorIds.push(actorId);
        else edges.set(key, { source: a, target: b, actorIds: [actorId] });
      }
    }
  }
  return [...edges.values()];
};

/** The shortest connection between two movies. */
export interface PathResult {
  /** Movie ids from start to end. */
  movies: Id[];
  /** Connecting actor between consecutive movies (length = movies.length - 1). */
  actors: Id[];
}

/**
 * Breadth-first search over the movie projection. Returns the shortest path
 * (fewest hops / "degrees of separation") or null if unconnected.
 */
export const shortestPath = (
  data: GraphData,
  startMovie: Id,
  endMovie: Id,
): PathResult | null => {
  if (startMovie === endMovie) return { movies: [startMovie], actors: [] };

  const { movieActors, actorMovies } = buildAdjacency(data);
  const prev = new Map<Id, { movie: Id; actor: Id }>();
  const visited = new Set<Id>([startMovie]);
  const queue: Id[] = [startMovie];

  while (queue.length) {
    const current = queue.shift()!;
    for (const actorId of movieActors.get(current) ?? []) {
      for (const next of actorMovies.get(actorId) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        prev.set(next, { movie: current, actor: actorId });
        if (next === endMovie) {
          return reconstruct(prev, startMovie, endMovie);
        }
        queue.push(next);
      }
    }
  }
  return null;
};

const reconstruct = (
  prev: Map<Id, { movie: Id; actor: Id }>,
  start: Id,
  end: Id,
): PathResult => {
  const movies: Id[] = [end];
  const actors: Id[] = [];
  let cursor = end;
  while (cursor !== start) {
    const step = prev.get(cursor)!;
    movies.push(step.movie);
    actors.push(step.actor);
    cursor = step.movie;
  }
  movies.reverse();
  actors.reverse();
  return { movies, actors };
};
