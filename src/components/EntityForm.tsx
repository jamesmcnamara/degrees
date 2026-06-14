/**
 * Shared form for editing a movie or an actor. Both forms are the same shape:
 * a name field plus a list of related (opposite-kind) entities managed via
 * autocomplete. Adding a related entity auto-creates its node and links it;
 * tapping one navigates to its form.
 */

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Autocomplete } from "./Autocomplete";
import type { EntityKind, Id } from "@/lib/types";
import { otherKind } from "@/lib/types";
import { ENTITY_CONFIG } from "@/lib/entityConfig";
import { localSource, type Suggestion } from "@/lib/suggestions";
import * as store from "@/lib/store";
import { useGraph } from "@/lib/store";
import { relatedIds } from "@/lib/graph";

interface EntityFormProps {
  kind: EntityKind;
  /** Existing entity id, or "new" to create one. */
  id: Id | "new";
}

export function EntityForm({ kind, id }: EntityFormProps) {
  const data = useGraph();
  const [, navigate] = useLocation();
  const config = ENTITY_CONFIG[kind];
  const related = otherKind(kind);
  const relatedConfig = ENTITY_CONFIG[related];

  const collection = kind === "movie" ? data.movies : data.actors;
  const entity = id === "new" ? undefined : collection[id];

  // The subject is created lazily on first link / first save.
  const [subjectId, setSubjectId] = useState<Id | null>(
    id === "new" ? null : id,
  );
  const [name, setName] = useState(entity?.name ?? "");

  const effectiveId = subjectId;
  const links = effectiveId ? relatedIds(data, kind, effectiveId) : [];
  const linkedSet = useMemo(() => new Set(links), [links.join(",")]);

  const source = useMemo(
    () => localSource(data, related, linkedSet),
    [data, related, linkedSet],
  );

  /** Ensure the subject node exists, returning its id. */
  const ensureSubject = (): Id | null => {
    const trimmed = name.trim();
    if (effectiveId) {
      if (entity && entity.name !== trimmed && trimmed) {
        store.renameEntity(kind, effectiveId, trimmed);
      }
      return effectiveId;
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
    if (kind === "movie") store.linkAppearance(owner, relatedId);
    else store.linkAppearance(relatedId, owner);
  };

  const removeRelated = (relatedId: Id) => {
    if (!effectiveId) return;
    if (kind === "movie") store.unlinkAppearance(effectiveId, relatedId);
    else store.unlinkAppearance(relatedId, effectiveId);
  };

  const removeSubject = () => {
    if (effectiveId) store.deleteEntity(kind, effectiveId);
    navigate("/");
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
          autoFocus={id === "new"}
        />
      </label>

      <section className="related">
        <h2 className="related__heading">{config.relatedHeading}</h2>

        {links.length > 0 ? (
          <ul className="chips">
            {links.map((relatedId) => {
              const relatedEntity =
                related === "movie"
                  ? data.movies[relatedId]
                  : data.actors[relatedId];
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

      {effectiveId && (
        <button type="button" className="btn btn--danger" onClick={removeSubject}>
          Delete {config.noun}
        </button>
      )}
    </div>
  );
}
