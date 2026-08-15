import { useEffect, useRef } from 'react';
import type { LooperApi } from '@/hooks/useLooper';

// Keyboard transport for the loop station.
//
// Bound at the window, from App.tsx, NOT from the drawer: the loop keeps
// playing with the drawer closed (same as the practice drums), so the keys have
// to keep working there too. The one thing a looping guitarist cannot do is
// aim a mouse mid-phrase, and the tester's first ask was a fast undo , hence
// ⌘/Ctrl+Z cancelling a take that is still rolling rather than only stepping
// back through finished ones (useLooper.undo does that switch).
//
// Nothing fires while a form control has focus, so typing a patch name or
// dragging a slider can never trigger the transport. SPACE additionally stands
// down for buttons and links, where the browser's own activation is what the
// user is expecting.

export interface LooperHotkey {
  /** what to print in the legend */
  keys: string;
  label: string;
}

/** The legend the panel renders. Keep in step with handleKey below. */
export const LOOPER_HOTKEYS: readonly LooperHotkey[] = [
  { keys: 'SPACE', label: 'play / stop all' },
  { keys: 'R', label: 'record / stop' },
  { keys: 'CTRL Z', label: 'undo (cancels a take in progress)' },
  { keys: 'CTRL ⇧ Z', label: 'redo' },
  { keys: 'M', label: 'mute selected track' },
  { keys: '[ ]', label: 'previous / next track' },
  { keys: 'DEL', label: 'delete selected track' },
];

const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION']);
const ACTIVATION_TAGS = new Set(['BUTTON', 'A', 'SUMMARY']);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (FORM_TAGS.has(target.tagName)) return true;
  return target.isContentEditable;
}

function stealsSpace(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ACTIVATION_TAGS.has(target.tagName);
}

export function useLooperHotkeys(looper: LooperApi, enabled: boolean): void {
  // `looper` is a fresh object every render; read it through a ref so the
  // listener is installed once instead of on every state change.
  const looperRef = useRef(looper);
  looperRef.current = looper;

  useEffect(() => {
    if (!enabled) return;

    const handleKey = (event: KeyboardEvent) => {
      const api = looperRef.current;
      if (!api.ready || event.repeat) return;
      if (isTypingTarget(event.target)) return;

      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === 'z') {
          event.preventDefault();
          if (event.shiftKey) api.redo();
          else api.undo();
        }
        if (key === 'y') {
          event.preventDefault();
          api.redo();
        }
        return;
      }
      if (event.altKey || event.shiftKey) return;

      if (event.key === ' ') {
        if (stealsSpace(event.target)) return;
        event.preventDefault();
        api.togglePlayAll();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (api.selectedTrack === null) return;
        event.preventDefault();
        api.clear(api.selectedTrack);
        return;
      }
      if (event.key === '[') {
        api.selectPrevTrack();
        return;
      }
      if (event.key === ']') {
        api.selectNextTrack();
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'r') {
        event.preventDefault();
        api.toggleRecord();
        return;
      }
      if (key === 'm') api.toggleMuteSelected();
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [enabled]);
}
