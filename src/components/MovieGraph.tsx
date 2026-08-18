/**
 * Cytoscape rendering of the movie projection: movies are nodes, shared actors
 * are edges. An optional highlighted path (start -> end) is emphasised.
 */

import { useEffect, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import type { Id } from "@/lib/types";
import { Graph, type PathResult } from "@/lib/graph";

interface MovieGraphProps {
  graph: Graph;
  path: PathResult | null;
  onSelectMovie?: (id: Id) => void;
}

const STYLE: cytoscape.StylesheetJson = [
  {
    selector: "node",
    style: {
      "background-color": "#3b4252",
      label: "data(label)",
      color: "#e5e9f0",
      "font-size": 11,
      "text-wrap": "wrap",
      "text-max-width": "90px",
      "text-valign": "center",
      "text-halign": "center",
      width: 14,
      height: 14,
      "text-margin-y": -2,
    },
  },
  {
    selector: "edge",
    style: {
      width: 1.5,
      "line-color": "#434c5e",
      "curve-style": "bezier",
      label: "data(label)",
      "font-size": 9,
      color: "#7b88a1",
      "text-rotation": "autorotate",
      "text-background-color": "#1f2430",
      "text-background-opacity": 0.85,
      "text-background-padding": "2px",
    },
  },
  {
    selector: ".path-node",
    style: {
      "background-color": "#88c0d0",
      width: 20,
      height: 20,
      color: "#eceff4",
      "font-size": 13,
      "font-weight": "bold",
    },
  },
  {
    selector: ".path-edge",
    style: {
      width: 4,
      "line-color": "#88c0d0",
      color: "#d8dee9",
      "font-size": 11,
    },
  },
  {
    selector: ".endpoint",
    style: { "background-color": "#a3be8c" },
  },
];

const buildElements = (graph: Graph): ElementDefinition[] => {
  const nodes: ElementDefinition[] = Object.values(graph.movies).map((m) => ({
    data: { id: m.id, label: m.name },
  }));
  const edges: ElementDefinition[] = graph.movieProjection().map((e) => ({
    data: {
      id: `${e.source}~${e.target}`,
      source: e.source,
      target: e.target,
      label: e.actorIds
        .map((a) => graph.actors[a]?.name)
        .filter(Boolean)
        .join(", "),
    },
  }));
  return [...nodes, ...edges];
};

export function MovieGraph({ graph, path, onSelectMovie }: MovieGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  // Init once.
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      style: STYLE,
      elements: buildElements(graph),
      layout: { name: "cose", animate: false, padding: 30 },
      minZoom: 0.2,
      maxZoom: 2.5,
    });
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wire selection callback.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !onSelectMovie) return;
    const handler = (e: cytoscape.EventObject) => onSelectMovie(e.target.id());
    cy.on("tap", "node", handler);
    return () => {
      cy.off("tap", "node", handler);
    };
  }, [onSelectMovie]);

  // Rebuild elements when the graph data changes.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.json({ elements: buildElements(graph) });
    cy.layout({ name: "cose", animate: false, padding: 30 }).run();
  }, [graph]);

  // Apply path highlight without re-laying-out.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("path-node path-edge endpoint");
    if (!path) return;

    path.movies.forEach((m) => cy.getElementById(m).addClass("path-node"));
    const first = path.movies[0];
    const last = path.movies[path.movies.length - 1];
    if (first) cy.getElementById(first).addClass("endpoint");
    if (last) cy.getElementById(last).addClass("endpoint");

    for (let i = 0; i < path.movies.length - 1; i++) {
      const a = path.movies[i]!;
      const b = path.movies[i + 1]!;
      cy.edges()
        .filter(
          (edge) =>
            (edge.source().id() === a && edge.target().id() === b) ||
            (edge.source().id() === b && edge.target().id() === a),
        )
        .addClass("path-edge");
    }

    if (path.movies.length > 1) {
      cy.animate(
        { fit: { eles: cy.elements(".path-node"), padding: 60 } },
        { duration: 400 },
      );
    }
  }, [path]);

  return <div className="graph-canvas" ref={containerRef} />;
}
