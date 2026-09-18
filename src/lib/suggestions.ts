/**
 * Suggestion sources for the autocomplete inputs.
 *
 * A `SuggestionSource` maps a query string to candidate entities. Today we
 * only search the user's own data (works fully offline), but the signature is
 * async so a remote source (e.g. TMDb) can be slotted in or merged later via
 * `mergeSources` without touching the components.
 */

import type { EntityKind, Id } from "./types";
import type { Graph } from "./graph";

export interface Suggestion {
  /** Present when the suggestion already exists in the local graph. */
  id?: Id;
  label: string;
}

export type SuggestionSource = (
  query: string,
) => Suggestion[] | Promise<Suggestion[]>;

const FILLER_WORDS = new Set(["a", "an", "the"]);
const MIN_FUZZY_TERM_LENGTH = 3;

export const normalizeSuggestionText = (value: string): string[] =>
  value
    .toLowerCase()
    // Remove everything except Unicode letters, numbers, and whitespace.
    .replace(/[^\p{L}\p{N}\s]+/gu, "")
    .split(" ")
    .filter((word) => word && !FILLER_WORDS.has(word));

const isWithinOneEdit = (left: string, right: string): boolean => {
  if (Math.abs(left.length - right.length) > 1) return false;

  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex++;
      rightIndex++;
      continue;
    }

    edits++;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex++;
    else if (right.length > left.length) rightIndex++;
    else {
      leftIndex++;
      rightIndex++;
    }
  }

  return true;
};

const termMatches = (queryTerm: string, nameTerm: string): boolean =>
  nameTerm.includes(queryTerm) ||
  (queryTerm.length >= MIN_FUZZY_TERM_LENGTH &&
    isWithinOneEdit(queryTerm, nameTerm));

export const matchesSuggestionQuery = (
  query: string,
  suggestion: string,
): boolean => {
  const queryTerms = normalizeSuggestionText(query);
  if (queryTerms.length === 0) return false;

  const suggestionTerms = normalizeSuggestionText(suggestion);
  const compactSuggestion = suggestionTerms.join("");
  const matchTerms = compactSuggestion
    ? [...suggestionTerms, compactSuggestion]
    : suggestionTerms;
  return queryTerms.every((queryTerm) =>
    matchTerms.some((suggestionTerm) => termMatches(queryTerm, suggestionTerm)),
  );
};

/** Search the local graph for entities of `kind`, excluding some ids. */
export const localSource =
  (
    data: Graph,
    kind: EntityKind,
    exclude: Set<Id> = new Set(),
  ): SuggestionSource =>
  (query) => {
    const collection = kind === "movie" ? data.movies : data.actors;
    const hasQuery = query.trim().length > 0;
    return Object.values(collection)
      .filter((e) => !exclude.has(e.id))
      .filter((e) => !hasQuery || matchesSuggestionQuery(query, e.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8)
      .map((e) => ({ id: e.id, label: e.name }));
  };

/** Run several sources and concatenate their results, de-duplicating by id. */
export const mergeSources =
  (...sources: SuggestionSource[]): SuggestionSource =>
  async (query) => {
    const all = (await Promise.all(sources.map((s) => s(query)))).flat();
    const seen = new Set<string>();
    return all.filter((s) => {
      const key = s.id ?? s.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
