/**
 * Pure, immutable operations over `GraphData`.
 *
 * The data is a bipartite graph (movies <-> actors joined by appearances).
 * The "game" view projects it onto movies-only, where two movies are linked
 * when they share an actor.
 */

import type { Appearance, Entity, EntityKind, GraphData, Id } from './types';
import { newId } from './id';
import {
  concat,
  cons,
  filter,
  findBy,
  map,
  mod,
  not,
  set,
  some,
  updateAll
} from 'shades';

export const emptyGraph = (): GraphData => ({
  movies: {},
  actors: {},
  appearances: []
});

const collection = (data: GraphData, kind: EntityKind) =>
  kind === 'movie' ? data.movies : data.actors;

/** Look up an existing entity of `kind` by case-insensitive name. */
export const findByName = (
  data: GraphData,
  kind: EntityKind,
  name?: string
): Id | undefined => {
  if (!name) return undefined;
  const target = name.trim().toLowerCase();
  return Object.values(collection(data, kind)).find(
    (e) => e.name.toLowerCase() === target
  )?.id;
};

/** Create the entity if it doesn't already exist; return [next, id]. */
export const upsertEntity = (
  data: GraphData,
  kind: EntityKind,
  rawName: string
): [GraphData, Id] => {
  const name = rawName.trim();
  const existing = findByName(data, kind, name);
  if (existing) return [data, existing];

  const id = newId();
  const key = kind === 'movie' ? 'movies' : 'actors';
  return [set(key, id)({ id, name })(data), id];
};

/** Rename an existing entity. */
export const renameEntity = (
  data: GraphData,
  kind: EntityKind,
  id: Id,
  name: string
): GraphData => {
  const key = kind === 'movie' ? 'movies' : 'actors';
  const entity = data[key][id];
  if (!entity) return data;
  return set(key, id, 'name')(name.trim())(data);
};

/** Remove an entity and any appearances that reference it. */
export const deleteEntity = (
  data: GraphData,
  kind: EntityKind,
  id: Id
): GraphData => {
  const key = kind === 'movie' ? 'movies' : 'actors';
  const { [id]: _removed, ...rest } = data[key];
  const matcher = kind === 'movie' ? { movieId: id } : { actorId: id };

  return updateAll<GraphData>(
    set(key)(rest),
    mod('appearances')(filter(not(matcher)))
  )(data);
};

export const mergeGraphs = (fst: GraphData, snd: GraphData): GraphData => {
  let merged = {
    movies: mergeMaps(fst.movies, snd.movies),
    actors: mergeMaps(fst.actors, snd.actors),
    appearances: fst.appearances
  };
  merged = mergeAppearances(merged, snd);
  return merged;
};

const mergeMaps = (
  fst: Record<string, Entity>,
  snd: Record<string, Entity>
): Record<string, Entity> => {
  const out = { ...fst };
  const flipped = Object.fromEntries(
    Object.entries(fst).map(([id, entity]) => [normalize(entity.name), entity])
  );
  for (const entity of Object.values(snd)) {
    const existing = flipped[normalize(entity.name)];
    if (!existing) {
      out[entity.id] = entity;
    }
  }
  return out;
};

const normalize = (s: string): string => s.toLowerCase().trim();

const mergeAppearances = (merged: GraphData, toMerge: GraphData) => {
  for (const appearance of toMerge.appearances) {
    const movie = toMerge.movies[appearance.movieId]!.name;
    const actor = toMerge.actors[appearance.actorId]!.name;
    merged = linkAppearanceByName(merged, movie, actor);
  }
  return merged;
};

const hasAppearance = (data: GraphData, movieId?: Id, actorId?: Id) =>
  some({ movieId, actorId })(data.appearances);

export const hasAppearanceByName = (
  data: GraphData,
  movie?: string,
  actor?: string
) => {
  return hasAppearance(
    data,
    findByName(data, 'movie', movie),
    findByName(data, 'actor', actor)
  );
};

/** Connect a movie and an actor (no-op if already connected). */
export const linkAppearance = (
  data: GraphData,
  movieId: Id,
  actorId: Id
): GraphData =>
  hasAppearance(data, movieId, actorId)
    ? data
    : mod('appearances')(cons({ movieId, actorId }))(data);

export const linkAppearanceByName = (
  data: GraphData,
  movie: string,
  actor: string
) => {
  const movieId = findByName(data, 'movie', movie);
  const actorId = findByName(data, 'actor', actor);
  if (movieId && actorId) return linkAppearance(data, movieId, actorId);
  return data;
};

/** Remove the edge between a movie and an actor. */
export const unlinkAppearance = (
  data: GraphData,
  movieId: Id,
  actorId: Id
): GraphData => mod('appearances')(filter(not({ movieId, actorId })))(data);

/** Ids of entities linked to `id` (the opposite kind). */
export const relatedIds = (data: GraphData, kind: EntityKind, id: Id): Id[] =>
  kind === 'movie'
    ? map('actorId')(filter({ movieId: id })(data.appearances))
    : map('movieId')(filter({ actorId: id })(data.appearances));

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
  endMovie: Id
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
  end: Id
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
