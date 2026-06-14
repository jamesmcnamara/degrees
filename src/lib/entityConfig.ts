/** Per-kind UI copy that drives the shared `EntityForm`. */

import type { EntityKind } from "./types";

export interface EntityConfig {
  /** Singular noun, e.g. "Movie". */
  noun: string;
  /** Label for the entity's own name field. */
  nameLabel: string;
  /** Heading for the list of related (opposite-kind) entities. */
  relatedHeading: string;
  /** Placeholder for the "add related" autocomplete. */
  addRelatedPlaceholder: string;
  /** Route prefix for this kind. */
  path: (id: string) => string;
}

export const ENTITY_CONFIG: Record<EntityKind, EntityConfig> = {
  movie: {
    noun: "Movie",
    nameLabel: "Title",
    relatedHeading: "Cast",
    addRelatedPlaceholder: "Add an actor…",
    path: (id) => `/movie/${id}`,
  },
  actor: {
    noun: "Actor",
    nameLabel: "Name",
    relatedHeading: "Filmography",
    addRelatedPlaceholder: "Add a movie…",
    path: (id) => `/actor/${id}`,
  },
};
