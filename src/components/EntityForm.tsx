/**
 * Shared form for editing a movie or an actor. Both forms are the same shape:
 * a name field plus a list of related (opposite-kind) entities managed via
 * autocomplete. Adding a related entity auto-creates its node and links it;
 * tapping one navigates to its form.
 */

import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { Autocomplete } from './Autocomplete';
import { MovieDiaryEditor } from './MovieDiaryEditor';
import type { EntityKind, Id } from '@/lib/types';
import { otherKind } from '@/lib/types';
import { ENTITY_CONFIG } from '@/lib/entityConfig';
import { localSource, type Suggestion } from '@/lib/suggestions';
import * as store from '@/lib/store';
import { useGraph } from '@/lib/store';

interface EntityFormProps {
  kind: EntityKind;
  /** Existing entity id, or "new" to create one. */
  id: Id | 'new';
}

export function EntityForm({ kind, id }: EntityFormProps) {
  const graph = useGraph();
  const [, navigate] = useLocation();
  const config = ENTITY_CONFIG[kind];
  const related = otherKind(kind);
  const relatedConfig = ENTITY_CONFIG[related];

  const collection = kind === 'movie' ? graph.movies : graph.actors;
  const entity = id === 'new' ? undefined : collection[id];

  // The subject is created lazily on first link / first save.
  const [subjectId, setSubjectId] = useState<Id | null>(
    id === 'new' ? null : id
  );
  const [name, setName] = useState(entity?.name ?? '');

  const links = subjectId ? graph.relatedIds(kind, subjectId) : [];
  const linkedSet = useMemo(() => new Set(links), [links.join(',')]);

  const source = useMemo(
    () => localSource(graph, related, linkedSet),
    [graph, related, linkedSet]
  );

  /** Ensure the subject node exists, returning its id. */
  const ensureSubject = (): Id | null => {
    const trimmed = name.trim();
    if (subjectId) {
      if (entity && entity.name !== trimmed && trimmed) {
        store.renameEntity(kind, subjectId, trimmed);
      }
      return subjectId;
    }
    if (!trimmed) return null;
    const created = store.upsertEntity(kind, trimmed);
    setSubjectId(created);
    navigate(config.path(created), { replace: true });
    return created;
  };

  const onNameBlur = () => {
    if (name.trim()) ensureSubject();
  };

  const addRelated = (suggestion: Suggestion) => {
    const owner = ensureSubject();
    if (!owner) return;
    const relatedId =
      suggestion.id ?? store.upsertEntity(related, suggestion.label);
    if (kind === 'movie') store.linkAppearance(owner, relatedId);
    else store.linkAppearance(relatedId, owner);
  };

  const removeRelated = (relatedId: Id) => {
    if (!subjectId) return;
    if (kind === 'movie') store.unlinkAppearance(subjectId, relatedId);
    else store.unlinkAppearance(relatedId, subjectId);
  };

  return (
    <div className="form">
      <label className="field">
        <span className="field__label">{config.nameLabel}</span>
        <input
          className="field__input"
          value={name}
          placeholder={config.nameLabel}
          onChange={(e) => setName(e.target.value)}
          onBlur={onNameBlur}
          autoCapitalize="words"
          autoFocus={id === 'new'}
        />
      </label>

      <section className="related">
        <h2 className="related__heading">{config.relatedHeading}</h2>

        {links.length > 0 ? (
          <ul className="chips">
            {links.map((relatedId) => {
              const relatedEntity =
                related === 'movie'
                  ? graph.movies[relatedId]
                  : graph.actors[relatedId];
              if (!relatedEntity) return null;
              return (
                <li key={relatedId} className="chip">
                  <button
                    type="button"
                    className="chip__label"
                    onClick={() => navigate(relatedConfig.path(relatedId))}
                  >
                    {relatedEntity.name}
                  </button>
                  <button
                    type="button"
                    className="chip__remove"
                    aria-label={`Remove ${relatedEntity.name}`}
                    onClick={() => removeRelated(relatedId)}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">Nothing here yet.</p>
        )}

        <Autocomplete
          source={source}
          onPick={addRelated}
          placeholder={config.addRelatedPlaceholder}
        />
      </section>

      {kind === 'movie' && (
        <MovieDiaryEditor
          movieId={subjectId}
          movieName={name}
          ensureMovie={ensureSubject}
        />
      )}
    </div>
  );
}
