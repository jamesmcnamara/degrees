/**
 * Generic autocomplete input. Suggestions come from a pluggable
 * `SuggestionSource`, so the same component serves local-only search today and
 * a remote source later. Picking an existing suggestion yields its id; typing
 * a new value and confirming yields `{ label }` with no id (caller creates it).
 */

import { useEffect, useRef, useState } from 'react';
import type { Suggestion, SuggestionSource } from '@/lib/suggestions';

interface AutocompleteProps {
  source: SuggestionSource;
  onPick: (suggestion: Suggestion) => void;
  placeholder?: string;
}

export function Autocomplete({
  source,
  onPick,
  placeholder
}: AutocompleteProps) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(source(query)).then((results) => {
      if (!cancelled) {
        setItems(results);
        setActive(0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query, source]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onClickOutside);
    return () => document.removeEventListener('pointerdown', onClickOutside);
  }, []);

  const trimmed = query.trim();
  const exactExists = items.some(
    (i) => i.label.toLowerCase() === trimmed.toLowerCase()
  );
  const options: Suggestion[] =
    trimmed && !exactExists ? [...items, { label: trimmed }] : items;

  const pick = (suggestion: Suggestion) => {
    onPick(suggestion);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = options[active];
      if (chosen) pick(chosen);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="autocomplete" ref={boxRef}>
      <input
        className="autocomplete__input"
        value={query}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        autoCapitalize="words"
        enterKeyHint="enter"
      />
      {open && options.length > 0 && (
        <ul className="autocomplete__list">
          {options.map((opt, i) => (
            <li key={opt.id ?? `new:${opt.label}`}>
              <button
                type="button"
                className={
                  'autocomplete__option' +
                  (i === active ? ' autocomplete__option--active' : '')
                }
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(opt)}
              >
                {opt.id ? (
                  opt.label
                ) : (
                  <>
                    <span className="autocomplete__add">+ Add</span> “
                    {opt.label}”
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
