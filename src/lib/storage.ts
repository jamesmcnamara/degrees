/** Persist the graph as a JSON blob in localStorage. */

import type { GraphData } from "./types";
import { emptyGraph } from "./graph";

const KEY = "six-degrees:graph:v1";

export const load = (): GraphData => {
  if (typeof localStorage === "undefined") return emptyGraph();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyGraph();
    const parsed = JSON.parse(raw) as Partial<GraphData>;
    return {
      movies: parsed.movies ?? {},
      actors: parsed.actors ?? {},
      appearances: parsed.appearances ?? [],
    };
  } catch {
    return emptyGraph();
  }
};

export const save = (data: GraphData): void => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(data));
};
