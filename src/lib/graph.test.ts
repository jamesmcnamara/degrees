import { test, expect } from 'bun:test';
import {
  emptyGraph,
  upsertEntity,
  linkAppearance,
  unlinkAppearance,
  deleteEntity,
  relatedIds,
  movieProjection,
  shortestPath,
  mergeGraphs,
  hasAppearanceByName
} from './graph';
import type { GraphData, Id } from './types';

/** Build a small graph and return helpers to resolve ids by name. */
const buildFixture = () => {
  let data: GraphData = emptyGraph();
  const ids: Record<string, Id> = {};

  const movie = (name: string) => {
    const [next, id] = upsertEntity(data, 'movie', name);
    data = next;
    ids[name] = id;
    return id;
  };
  const actor = (name: string) => {
    const [next, id] = upsertEntity(data, 'actor', name);
    data = next;
    ids[name] = id;
    return id;
  };
  const link = (m: string, a: string) => {
    movie(m);
    actor(a);
    data = linkAppearance(data, ids[m]!, ids[a]!);
  };

  // A --Alice-- B --Bob-- C ; D is isolated.
  link('A', 'Alice');
  link('B', 'Alice');
  link('B', 'Bob');
  link('C', 'Bob');
  movie('D');

  return { get: () => data, ids, movie, link, actor };
};

test('upsertEntity de-duplicates by case-insensitive name', () => {
  let data = emptyGraph();
  const [d1, id1] = upsertEntity(data, 'movie', 'Heat');
  const [d2, id2] = upsertEntity(d1, 'movie', '  heat ');
  expect(id1).toBe(id2);
  expect(Object.keys(d2.movies)).toHaveLength(1);
});

test('relatedIds returns the opposite-kind neighbours', () => {
  const { get, ids } = buildFixture();
  expect(relatedIds(get(), 'movie', ids.B!).sort()).toEqual(
    [ids.Alice!, ids.Bob!].sort()
  );
  expect(relatedIds(get(), 'actor', ids.Alice!).sort()).toEqual(
    [ids.A!, ids.B!].sort()
  );
});

test('movieProjection links movies that share an actor', () => {
  const { get, ids } = buildFixture();
  const edges = movieProjection(get());
  const pair = edges.find(
    (e) =>
      (e.source === ids.A && e.target === ids.B) ||
      (e.source === ids.B && e.target === ids.A)
  );
  expect(pair).toBeDefined();
  expect(pair!.actorIds).toEqual([ids.Alice!]);
});

test('shortestPath finds the actor chain between two movies', () => {
  const { get, ids } = buildFixture();
  const result = shortestPath(get(), ids.A!, ids.C!);
  expect(result).not.toBeNull();
  expect(result!.movies).toEqual([ids.A!, ids.B!, ids.C!]);
  expect(result!.actors).toEqual([ids.Alice!, ids.Bob!]);
});

test('shortestPath returns null when disconnected', () => {
  const { get, ids } = buildFixture();
  expect(shortestPath(get(), ids.A!, ids.D!)).toBeNull();
});

test('shortestPath of a movie to itself is zero degrees', () => {
  const { get, ids } = buildFixture();
  expect(shortestPath(get(), ids.A!, ids.A!)).toEqual({
    movies: [ids.A!],
    actors: []
  });
});

test('deleteEntity removes the node and its appearances', () => {
  const { get, ids } = buildFixture();
  const data = deleteEntity(get(), 'actor', ids.Alice!);
  expect(data.actors[ids.Alice!]).toBeUndefined();
  expect(data.appearances.some((a) => a.actorId === ids.Alice)).toBe(false);
  // A is now only reachable to nothing; A->C no longer connected.
  expect(shortestPath(data, ids.A!, ids.C!)).toBeNull();
});

test('unlinkAppearance removes a single edge', () => {
  const { get, ids } = buildFixture();
  const data = unlinkAppearance(get(), ids.B!, ids.Bob!);
  expect(relatedIds(data, 'movie', ids.B!)).toEqual([ids.Alice!]);
});

test('mergeGraphs left merges graphs and updates UUIDs', () => {
  const fst = buildFixture();
  const snd = buildFixture();

  fst.link('E', 'Carol');
  snd.link('E', 'Derrick');
  const merged = mergeGraphs(fst.get(), snd.get());
  expect(Object.entries(merged.actors)).toHaveLength(4);
  expect(Object.entries(merged.movies)).toHaveLength(5);
  expect(Object.entries(merged.appearances)).toHaveLength(6);
  expect(hasAppearanceByName(merged, 'E', 'Carol')).toBeTrue();
  expect(hasAppearanceByName(merged, 'E', 'Derrick')).toBeTrue();
});
