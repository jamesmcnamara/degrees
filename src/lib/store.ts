/**
 * A tiny external store bound to React via `useSyncExternalStore`.
 * All mutations go through the pure ops in `graph.ts` and persist to
 * localStorage on every change.
 */

import { useSyncExternalStore } from "react";
import type { EntityKind, GraphData, Id } from "./types";
import { load, save } from "./storage";
import * as G from "./graph";

let state: GraphData = load();
const listeners = new Set<() => void>();

const getState = () => state;

const set = (next: GraphData) => {
  state = next;
  save(state);
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Subscribe a component to the whole graph. */
export const useGraph = (): GraphData =>
  useSyncExternalStore(subscribe, getState, getState);

// --- actions ---------------------------------------------------------------

/** Create (or find existing) entity by name; returns its id. */
export const upsertEntity = (kind: EntityKind, name: string): Id => {
  const [next, id] = G.upsertEntity(state, kind, name);
  set(next);
  return id;
};

export const renameEntity = (kind: EntityKind, id: Id, name: string): void =>
  set(G.renameEntity(state, kind, id, name));

export const deleteEntity = (kind: EntityKind, id: Id): void =>
  set(G.deleteEntity(state, kind, id));

export const linkAppearance = (movieId: Id, actorId: Id): void =>
  set(G.linkAppearance(state, movieId, actorId));

export const unlinkAppearance = (movieId: Id, actorId: Id): void =>
  set(G.unlinkAppearance(state, movieId, actorId));

/** Read the current snapshot outside React (rarely needed). */
export const snapshot = getState;
