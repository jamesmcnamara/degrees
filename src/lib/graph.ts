/**
 * Pure, immutable operations over `GraphData`.
 *
 * The data is a bipartite graph (movies <-> actors joined by appearances).
 * The "game" view projects it onto movies-only, where two movies are linked
 * when they share an actor.
 */

import { produce } from "immer";
import { filter, map, not, some } from "shades";
import { newId } from "./id";
import type {
  Appearance,
  DiaryEntry,
  Entity,
  EntityKind,
  GraphData,
  Id,
  Movie,
} from "./types";

interface GraphOptions {
  data?: GraphData;
  isCloning?: boolean;
}
export class Graph {
  private _data: GraphData = {
    movies: {},
    actors: {},
    appearances: [],
  };

  constructor({ data, isCloning }: GraphOptions = {}) {
    if (data) {
      this._data = data;
    }
    if (!isCloning) {
      // Normalize diary entries and entity names on construction.
      this._data = produce(this._data, (draft) => {
        for (const movie of Object.values(draft.movies)) {
          movie.diary = normalizeDiary(movie.diary);
        }
      });
    }
  }

  get movies(): Readonly<Record<Id, Movie>> {
    return this._data.movies;
  }

  get actors(): Readonly<Record<Id, Entity>> {
    return this._data.actors;
  }

  get appearances(): ReadonlyArray<Appearance> {
    return this._data.appearances;
  }

  findByName(kind: EntityKind, name?: string): Id | undefined {
    if (!name) return undefined;
    const target = name.trim().toLowerCase();
    return Object.values(
      kind === "movie" ? this._data.movies : this._data.actors,
    ).find((e) => e.name.toLowerCase() === target)?.id;
  }

  upsert(kind: EntityKind, rawName: string): Id {
    const name = rawName.trim();
    const existing = this.findByName(kind, name);
    if (existing) return existing;

    const id = newId();
    this._data = produce(this._data, (draft) => {
      if (kind === "movie") {
        draft.movies[id] = { id, name, diary: [] };
      } else {
        draft.actors[id] = { id, name };
      }
    });
    return id;
  }

  rename(kind: EntityKind, id: Id, name: string) {
    this._data = produce(this._data, (draft) => {
      const entity = draft[kind === "movie" ? "movies" : "actors"][id];
      if (entity) {
        entity.name = name;
      }
    });
  }

  delete(kind: EntityKind, id: Id) {
    const key = kind === "movie" ? "movies" : "actors";
    const matcher = kind === "movie" ? { movieId: id } : { actorId: id };
    this._data = produce(this._data, (draft) => {
      delete draft[key][id];
      draft.appearances = filter(not(matcher))(draft.appearances);
    });
  }

  private hasAppearance = (movieId?: Id, actorId?: Id) =>
    some({ movieId, actorId })(this._data.appearances);

  hasAppearanceByName = (movie?: string, actor?: string) => {
    return this.hasAppearance(
      this.findByName("movie", movie),
      this.findByName("actor", actor),
    );
  };

  link(movieId: Id, actorId: Id) {
    if (!this.hasAppearance(movieId, actorId)) {
      this._data = produce(this._data, (draft) => {
        draft.appearances.push({ movieId, actorId });
      });
    }
  }

  unlink(movieId: Id, actorId: Id) {
    this._data = produce(this._data, (draft) => {
      draft.appearances = filter(not({ movieId, actorId }))(draft.appearances);
    });
  }

  setDiaryEntry(movieId: Id, date: string, text: string) {
    this._data = produce(this._data, (draft) => {
      const movie = draft.movies[movieId];
      if (!movie) {
        return;
      }
      const existing = movie.diary?.find((entry) => entry.date === date);
      if (existing) {
        existing.text = text;
      } else {
        movie.diary = movie.diary ?? [];
        movie.diary.push({ date, text });
      }
    });
  }

  /** Ids of entities linked to `id` (the opposite kind). */
  relatedIds = (kind: EntityKind, id: Id): Id[] =>
    kind === "movie"
      ? map("actorId")(filter({ movieId: id })(this._data.appearances))
      : map("movieId")(filter({ actorId: id })(this._data.appearances));

  /** Build movie-vs-movie edges (one per pair, listing every shared actor). */
  movieProjection = (): ProjectionEdge[] => {
    const { actorMovies } = this.buildAdjacency();
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

  private buildAdjacency = (): Adjacency => {
    const movieActors = new Map<Id, Id[]>();
    const actorMovies = new Map<Id, Id[]>();
    for (const { movieId, actorId } of this.appearances) {
      pushTo(movieActors, movieId, actorId);
      pushTo(actorMovies, actorId, movieId);
    }
    return { movieActors, actorMovies };
  };

  shortestPath = (startMovie: Id, endMovie: Id): PathResult | null => {
    if (startMovie === endMovie) return { movies: [startMovie], actors: [] };

    const { movieActors, actorMovies } = this.buildAdjacency();
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

  // Cheap "clone": Graph mutators always replace `_data` with a fresh
  // immer-produced object (structural sharing, no deep copy), so wrapping
  // the current `_data` in a new Graph gives an independent, stable
  // snapshot without copying the whole graph.
  clone(): Graph {
    return new Graph({ data: this._data, isCloning: true });
  }

  stringify() {
    return JSON.stringify(this._data);
  }
}

const normalizeDiary = (diary: DiaryEntry[] | undefined): DiaryEntry[] =>
  Array.isArray(diary)
    ? diary.filter(
        (entry) =>
          typeof entry?.date === "string" && typeof entry.text === "string",
      )
    : [];

const normalize = (s: string): string => s.toLowerCase().trim();

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

const pairKey = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** An edge in the movie-only projection, labelled by the shared actor(s). */
export interface ProjectionEdge {
  source: Id;
  target: Id;
  actorIds: Id[];
}

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
interface MovieLink {
  movie: Id;
  actor: Id;
}

const reconstruct = (
  prev: Map<Id, MovieLink>,
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
