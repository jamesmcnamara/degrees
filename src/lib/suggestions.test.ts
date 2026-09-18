import { expect, test } from "bun:test";
import { Graph } from "./graph";
import {
  localSource,
  matchesSuggestionQuery,
  normalizeSuggestionText,
} from "./suggestions";

test("normalizes punctuation and filler words in suggestion queries", () => {
  expect(normalizeSuggestionText("The Spider-Man!")).toEqual(["spiderman"]);
  expect(matchesSuggestionQuery("spider-man", "The Spider Man")).toBe(true);
  expect(matchesSuggestionQuery("spider man", "The Spider-Man")).toBe(true);
});

test("matches normalized query terms within one edit", () => {
  expect(matchesSuggestionQuery("baso", "Basso")).toBe(true);
  expect(matchesSuggestionQuery("baso", "Bso")).toBe(true);
  expect(matchesSuggestionQuery("bso", "Basso")).toBe(false);
});

test("preserves suggestion labels while matching normalized titles", () => {
  const graph = new Graph();
  graph.upsert("movie", "The Spider-Man");
  const source = localSource(graph, "movie");

  expect(source("spider man")).toEqual([
    expect.objectContaining({ label: "The Spider-Man" }),
  ]);
});
