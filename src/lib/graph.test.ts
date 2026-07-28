import { expect, test } from 'bun:test';
import { Graph } from './graph';
import type { Id } from './types';

/** Build a small graph and return helpers to resolve ids by name. */
const buildFixture = () => {
  let graph: Graph = new Graph();
  const ids: Record<string, Id> = {};

  const movie = (name: string) => {
    const id = graph.upsert('movie', name);
    ids[name] = id;
    return id;
  };
  const actor = (name: string) => {
    const id = graph.upsert('actor', name);
    ids[name] = id;
    return id;
  };

  const link = (m: string, a: string) => {
    movie(m);
    actor(a);
    graph.link(ids[m]!, ids[a]!);
  };

  // A --Alice-- B --Bob-- C ; D is isolated.
  link('A', 'Alice');
  link('B', 'Alice');
  link('B', 'Bob');
  link('C', 'Bob');
  movie('D');

  return { get: () => graph, ids, movie, link, actor };
};

test('upsertEntity de-duplicates by case-insensitive name', () => {
  let graph = new Graph();
  const id1 = graph.upsert('movie', 'Heat');
  const id2 = graph.upsert('movie', '  heat ');
  expect(id1).toBe(id2);
  expect(Object.keys(graph.movies)).toHaveLength(1);
  expect(graph.movies[id1]?.diary).toEqual([]);
});

test('setDiaryEntry creates and updates one entry per movie and date', () => {
  const graph = new Graph();
  const movieId = graph.upsert('movie', 'Heat');

  graph.setDiaryEntry(movieId, '2026-07-28', 'Great');
  graph.setDiaryEntry(movieId, '2026-07-28', 'Still great');

  expect(graph.movies[movieId]?.diary).toEqual([
    { date: '2026-07-28', text: 'Still great' }
  ]);
});

test('clone returns an independent graph snapshot', () => {
  const graph = new Graph();
  const movieId = graph.upsert('movie', 'Heat');
  graph.setDiaryEntry(movieId, '2026-07-28', 'Original');
  const clone = graph.clone();

  graph.setDiaryEntry(movieId, '2026-07-28', 'Changed');

  expect(clone).not.toBe(graph);
  expect(clone.movies[movieId]?.diary[0]?.text).toBe('Original');
});

test('constructor gives legacy movies an empty diary', () => {
  const graph = new Graph({
    movies: {
      heat: { id: 'heat', name: 'Heat' }
    },
    actors: {},
    appearances: []
  });

  expect(graph.movies.heat?.diary).toEqual([]);
});

test('relatedIds returns the opposite-kind neighbours', () => {
  const { get, ids } = buildFixture();
  expect(get().relatedIds('movie', ids.B!).sort()).toEqual(
    [ids.Alice!, ids.Bob!].sort()
  );
  expect(get().relatedIds('actor', ids.Alice!).sort()).toEqual(
    [ids.A!, ids.B!].sort()
  );
});

test('movieProjection links movies that share an actor', () => {
  const { get, ids } = buildFixture();
  const edges = get().movieProjection();
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
  const result = get().shortestPath(ids.A!, ids.C!);
  expect(result).not.toBeNull();
  expect(result!.movies).toEqual([ids.A!, ids.B!, ids.C!]);
  expect(result!.actors).toEqual([ids.Alice!, ids.Bob!]);
});

test('shortestPath returns null when disconnected', () => {
  const { get, ids } = buildFixture();
  expect(get().shortestPath(ids.A!, ids.D!)).toBeNull();
});

test('shortestPath of a movie to itself is zero degrees', () => {
  const { get, ids } = buildFixture();
  expect(get().shortestPath(ids.A!, ids.A!)).toEqual({
    movies: [ids.A!],
    actors: []
  });
});

test('deleteEntity removes the node and its appearances', () => {
  const { get, ids } = buildFixture();
  const graph = get();
  graph.delete('actor', ids.Alice!);
  expect(graph.actors[ids.Alice!]).toBeUndefined();
  expect(graph.appearances.some((a) => a.actorId === ids.Alice)).toBe(false);
  // A is now only reachable to nothing; A->C no longer connected.
  expect(graph.shortestPath(ids.A!, ids.C!)).toBeNull();
});

test('unlinkAppearance removes a single edge', () => {
  const { get, ids } = buildFixture();
  const graph = get();
  graph.unlink(ids.B!, ids.Bob!);
  expect(graph.relatedIds('movie', ids.B!)).toEqual([ids.Alice!]);
});

test('mergeGraphs left merges graphs and updates UUIDs', () => {
  const fst = buildFixture();
  const snd = buildFixture();

  fst.link('E', 'Carol');
  snd.link('E', 'Derrick');
  const merged = fst.get();
  merged.merge(snd.get());
  expect(Object.entries(merged.actors)).toHaveLength(4);
  expect(Object.entries(merged.movies)).toHaveLength(5);
  expect(Object.entries(merged.appearances)).toHaveLength(6);
  expect(merged.hasAppearanceByName('E', 'Carol')).toBeTrue();
  expect(merged.hasAppearanceByName('E', 'Derrick')).toBeTrue();
});

test('mergeGraphs keeps diary entries from duplicate movies', () => {
  const fst = new Graph();
  const snd = new Graph();
  const fstMovie = fst.upsert('movie', 'Heat');
  const sndMovie = snd.upsert('movie', 'heat');
  fst.setDiaryEntry(fstMovie, '2026-07-27', 'First viewing');
  snd.setDiaryEntry(sndMovie, '2026-07-28', 'Second viewing');

  fst.merge(snd);

  expect(fst.movies[fstMovie]?.diary).toEqual([
    { date: '2026-07-27', text: 'First viewing' },
    { date: '2026-07-28', text: 'Second viewing' }
  ]);
});
