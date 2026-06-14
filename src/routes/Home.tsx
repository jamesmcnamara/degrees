/** Landing screen: jump into the game or manage movies and actors. */

import { Link, useLocation } from "wouter";
import type { EntityKind } from "@/lib/types";
import { ENTITY_CONFIG } from "@/lib/entityConfig";
import * as store from "@/lib/store";
import { useGraph } from "@/lib/store";

export function Home() {
  const data = useGraph();
  const movies = Object.values(data.movies).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const actors = Object.values(data.actors).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className="home">
      <Link href="/graph" className="cta">
        🎬 Find a connection
      </Link>

      <EntityList kind="movie" entities={movies} />
      <EntityList kind="actor" entities={actors} />
    </div>
  );
}

function EntityList({
  kind,
  entities,
}: {
  kind: EntityKind;
  entities: { id: string; name: string }[];
}) {
  const [, navigate] = useLocation();
  const config = ENTITY_CONFIG[kind];

  return (
    <section className="list">
      <header className="list__header">
        <h2>
          {config.noun}s <span className="muted">({entities.length})</span>
        </h2>
        <Link href={config.path("new")} className="btn btn--small">
          + Add
        </Link>
      </header>
      {entities.length === 0 ? (
        <p className="muted">No {config.noun.toLowerCase()}s yet.</p>
      ) : (
        <ul className="rows">
          {entities.map((e) => (
            <li key={e.id} className="row">
              <button
                type="button"
                className="row__label"
                onClick={() => navigate(config.path(e.id))}
              >
                {e.name}
              </button>
              <button
                type="button"
                className="row__remove"
                aria-label={`Delete ${e.name}`}
                onClick={() => store.deleteEntity(kind, e.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
