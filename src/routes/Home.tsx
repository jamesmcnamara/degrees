/** Landing screen: jump into the game or manage movies and actors. */

import { ENTITY_CONFIG } from '@/lib/entityConfig';
import * as store from '@/lib/store';
import { useGraph } from '@/lib/store';
import type { EntityKind } from '@/lib/types';
import { useState } from 'react';
import { Link, useLocation } from 'wouter';

export function Home() {
  const data = useGraph();
  const movies = Object.values(data.movies).sort((a, b) =>
    normalize(a.name).localeCompare(normalize(b.name))
  );
  const actors = Object.values(data.actors).sort((a, b) =>
    normalize(a.name).localeCompare(normalize(b.name))
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

interface EntityListProps {
  kind: EntityKind;
  entities: { id: string; name: string }[];
}

function EntityList({ kind, entities }: EntityListProps) {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState<string | undefined>(undefined);
  const config = ENTITY_CONFIG[kind];

  const filtered = search
    ? entities.filter((e) => normalize(e.name).includes(normalize(search)))
    : entities;

  return (
    <section className="list">
      <header className="list__header">
        <h2>
          {config.noun}s <span className="muted">({entities.length})</span>
        </h2>
        <Link href={config.path('new')} className="btn btn--small">
          + Add
        </Link>
      </header>
      <input
        type="text"
        name={`${kind}-search`}
        className="list__search"
        placeholder={`Search ${config.noun.toLowerCase()}s…`}
        value={search ?? ''}
        onChange={(e) => setSearch(e.target.value)}
      />
      {entities.length === 0 ? (
        <p className="muted">No {config.noun.toLowerCase()}s yet.</p>
      ) : (
        <ul className="rows">
          {filtered.map((e) => (
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

const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, '');
