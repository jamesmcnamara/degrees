/**
 * A tiny external store bound to React via `useSyncExternalStore`.
 * All mutations persist to localStorage and publish a fresh Graph snapshot.
 */

import { useSyncExternalStore } from 'react';
import type { EntityKind, Id } from './types';
import { load, save } from './storage';
import { Graph } from './graph';

let state: Graph = load();
const listeners = new Set<() => void>();

const getState = () => state;

const set = (next?: Graph) => {
  // useSyncExternalStore compares snapshots by identity. Clone after each
  // mutation so React subscribers rerender and memoized graph values refresh.
  state = (next ?? state).clone();
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

export const setDiaryEntry = (
  movieId: Id,
  date: string,
  text: string
): void => {
  state.setDiaryEntry(movieId, date, text);
  set(state);
};
