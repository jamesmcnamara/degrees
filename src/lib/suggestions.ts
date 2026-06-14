/**
 * Suggestion sources for the autocomplete inputs.
 *
 * A `SuggestionSource` maps a query string to candidate entities. Today we
 * only search the user's own data (works fully offline), but the signature is
 * async so a remote source (e.g. TMDb) can be slotted in or merged later via
 * `mergeSources` without touching the components.
 */

import type { EntityKind, GraphData, Id } from "./types";

export interface Suggestion {
  /** Present when the suggestion already exists in the local graph. */
  id?: Id;
  label: string;
}

export type SuggestionSource = (
  query: string,
) => Suggestion[] | Promise<Suggestion[]>;

/** Search the local graph for entities of `kind`, excluding some ids. */
export const localSource =
  (data: GraphData, kind: EntityKind, exclude: Set<Id> = new Set()): SuggestionSource =>
  (query) => {
    const collection = kind === "movie" ? data.movies : data.actors;
    const q = query.trim().toLowerCase();
    return Object.values(collection)
      .filter((e) => !exclude.has(e.id))
      .filter((e) => (q ? e.name.toLowerCase().includes(q) : true))
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
