/** Persist the graph as a JSON blob in localStorage. */

import type { GraphData } from "./types";
import { Graph } from "./graph";

const KEY = "six-degrees:graph:v1";

export const load = (): Graph => {
  if (typeof localStorage === "undefined") return new Graph();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Graph();
    const parsed = JSON.parse(raw) as Partial<GraphData>;
    return new Graph({
      data: {
        movies: parsed.movies ?? {},
        actors: parsed.actors ?? {},
        appearances: parsed.appearances ?? [],
      },
    });
  } catch {
    return new Graph();
  }
};

export const save = (graph: Graph): void => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, graph.stringify());
};
