/**
 * A tiny external store bound to React via `useSyncExternalStore`.
 * All mutations go through the pure ops in `graph.ts` and persist to
 * localStorage on every change.
 */

import { useSyncExternalStore } from 'react';
import type { EntityKind, GraphData, Id } from './types';
import { load, save } from './storage';
import { Graph } from './graph';

let state: Graph = load();
const listeners = new Set<() => void>();

const getState = () => state;

const set = (next?: Graph) => {
  if (next) state = next;
  save(state);
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Subscribe a component to the whole graph. */
export const useGraph = (): Graph =>
  useSyncExternalStore(subscribe, getState, getState);

// --- actions ---------------------------------------------------------------

/** Create (or find existing) entity by name; returns its id. */
export const upsertEntity = (kind: EntityKind, name: string): Id => {
  const id = state.upsert(kind, name);
  set(state);
  return id;
};

export const renameEntity = (kind: EntityKind, id: Id, name: string): void => {
  state.rename(kind, id, name);
  set(state);
};

export const deleteEntity = (kind: EntityKind, id: Id): void => {
  state.delete(kind, id);
  set(state);
};
export const linkAppearance = (movieId: Id, actorId: Id): void => {
  state.link(movieId, actorId);
  set(state);
};

export const unlinkAppearance = (movieId: Id, actorId: Id): void => {
  state.unlink(movieId, actorId);
  set(state);
};
