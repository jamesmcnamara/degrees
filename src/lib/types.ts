/** Domain types for the six-degrees graph. */

export type Id = string;

/** The two kinds of node in the bipartite graph. */
export type EntityKind = "movie" | "actor";

/** A node. Movies and actors share the same shape; `name` is the display string. */
export interface Entity {
  id: Id;
  name: string;
}

export interface DiaryEntry {
  /** Local calendar date for the viewing day, formatted as YYYY-MM-DD. */
  date: string;
  text: string;
}

export interface Movie extends Entity {
  diary?: DiaryEntry[];
}

/** A bipartite edge: an actor appears in a movie. */
export interface Appearance {
  movieId: Id;
  actorId: Id;
}

/** The entire app state, serialised as JSON into localStorage. */
export interface GraphData {
  movies: Record<Id, Movie>;
  actors: Record<Id, Entity>;
  appearances: Appearance[];
}

/** The kind opposite to the given one. */
export const otherKind = (kind: EntityKind): EntityKind =>
  kind === "movie" ? "actor" : "movie";
