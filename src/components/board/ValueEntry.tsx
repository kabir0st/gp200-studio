import { useEffect, useRef, useState } from 'react';
import type { KnobParam } from '@/core/effectParams';
import { SYNC_NOTES, noteIndex, noteValue } from '@/core/tempoSync';
import { entryText, parseEntry } from './paramValue';

interface ValueEntryProps {
  param: KnobParam;
  value: number;
  /** a tempo-synced knob picks from the note list instead of taking a number */
  synced: boolean;
  /** accessible name of the control being edited, e.g. "UK 800 Gain" */
  label: string;
  className: string;
  /** `param` is the one this entry was opened for; see below */
  onCommit: (value: number, param: KnobParam) => void;
  /** `refocus`: closed from the keyboard, so focus belongs back on the knob */
  onClose: (refocus: boolean) => void;
}

type EntryProps = Omit<ValueEntryProps, 'synced'>;

/**
 * Type an exact value into a knob, for when turning it keeps landing one either
 * side of the number you are matching. Shared by the board's PedalKnob and the
 * phone's focus rail; each decides when to open it and where focus goes after.
 *
 * Commits on Enter and on blur, cancels on Escape, and sends at most one param
 * change per entry rather than one per keystroke.
 *
 * An entry edits the param it was opened for, and hands that param back with
 * the value. The phone's rail re-points at a new knob on that knob's
 * pointerdown, which re-renders this field with the new param *before* the old
 * field's blur commits; reading the live prop there would type Rate's number
 * into Depth. `onCommit` itself stays live: App's param handler closes over the
 * connection status, and a pinned copy would not send if the pedal connected
 * while the field was open.
 */
export function ValueEntry({ synced, ...entry }: ValueEntryProps) {
  // pinned with the param: a rail re-pointed at a knob of the other kind must
  // not swap this field out (dropping what was typed) before its blur commits
  const openedSynced = useRef(synced).current;
  if (openedSynced) return <NoteEntry {...entry} />;
  return <NumberEntry {...entry} />;
}

function NumberEntry({ label, className, onCommit, onClose, ...opened }: EntryProps) {
  const { param, value } = useRef(opened).current;
  const [draft, setDraft] = useState(() => entryText(value, param));
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter and Escape hand focus back to the knob, which blurs this field on
  // its way out; that blur must not commit a second time, or commit an Escape.
  const done = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function finish(commit: boolean, refocus: boolean) {
    if (done.current) return;
    done.current = true;
    const next = parseEntry(draft, param);
    if (commit && next !== null && next !== value) onCommit(next, param);
    onClose(refocus);
  }

  // A phone's decimal keypad has no minus key, so a bipolar param (Feedback,
  // Pan) gets the full keyboard instead.
  let inputMode: 'decimal' | 'text' = 'decimal';
  if (param.min < 0) inputMode = 'text';

  return (
    <input
      ref={inputRef}
      className={className}
      type="text"
      inputMode={inputMode}
      enterKeyHint="done"
      autoComplete="off"
      spellCheck={false}
      value={draft}
      aria-label={`${label} value, ${param.min} to ${param.max}`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(true, false)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(true, true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(false, true);
        }
      }}
    />
  );
}

function NoteEntry({ label, className, onCommit, onClose, ...opened }: EntryProps) {
  const { param, value } = useRef(opened).current;
  const selectRef = useRef<HTMLSelectElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const select = selectRef.current;
    if (!select) return;
    select.focus();
    // Opening the list straight away saves a second click. It rides on the
    // user activation that opened this entry, and older engines (and jsdom)
    // lack it entirely; a focused select is still one click from open.
    try {
      select.showPicker?.();
    } catch {
      // no activation or no support: stay focused and closed
    }
  }, []);

  function close(refocus: boolean) {
    if (done.current) return;
    done.current = true;
    onClose(refocus);
  }

  return (
    <select
      ref={selectRef}
      className={className}
      value={noteIndex(value, param)}
      aria-label={`${label} note value`}
      onChange={(event) => {
        onCommit(noteValue(Number(event.target.value), param), param);
        close(true);
      }}
      onBlur={() => close(false)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'Escape') {
          event.preventDefault();
          close(true);
        }
      }}
    >
      {/* the position in SYNC_NOTES is the note's value (see noteValue) */}
      {SYNC_NOTES.map((note, index) => (
        <option key={note} value={index}>
          {note}
        </option>
      ))}
    </select>
  );
}
