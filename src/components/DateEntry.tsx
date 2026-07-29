import { isDiaryDate } from '@/lib/diary';
import { useState } from 'react';

interface DateEntryProps {
  date: string;
  setDate: (date: string) => void;
}

export function DateEntry({ date, setDate }: DateEntryProps) {
  const [draft, setDraft] = useState(date);
  const [error, setError] = useState<string | null>(null);

  function commit(date: string = draft) {
    const nextDate = date.trim();
    if (!isDiaryDate(nextDate)) {
      setError('Enter a valid date as YYYY-MM-DD.');
      return;
    }
    setDate(nextDate);
  }

  return (
    <>
      <input
        className="diary-editor__date-input"
        type="text"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={() => commit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            commit(date);
          }
        }}
        inputMode="numeric"
        placeholder="YYYY-MM-DD"
        aria-label="Diary date"
        name="diary-date"
        aria-invalid={error ? true : undefined}
        autoFocus
      />
      {error && <div className="field__error">{error}</div>}
    </>
  );
}
