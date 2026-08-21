import { useCallback, useEffect, useRef } from 'react';

export type ParamSender = (
  blockIndex: number,
  paramIndex: number,
  effectId: number,
  value: number,
) => void;

interface Pending {
  blockIndex: number;
  paramIndex: number;
  effectId: number;
  value: number;
}

/**
 * Collapse a burst of parameter edits into one SysEx frame per parameter per
 * animation frame.
 *
 * A continuous knob drag emits a value on every pointermove that changes the
 * snapped result — far more often than a native range input, which only reports
 * when the thumb crosses a step. Every one of those used to become its own
 * SysEx frame on the wire, each with its own echo-suppression window in
 * useMidiSend. Rendering already runs at frame rate, so anything finer than a
 * frame is sent faster than the user can see it land.
 *
 * Only the wire is throttled. Local preset state still updates on every event,
 * so the UI never lags the finger — and because the buffer keys on the
 * parameter, the value that ships is always the newest one, never a stale
 * midpoint. Two different parameters touched in the same frame both go.
 *
 * Deliberately NOT used for pushPresetToDevice, which sequences whole blocks
 * with its own settle delays and needs every frame it asks for.
 */
export function useCoalescedParamSend(send: ParamSender): ParamSender {
  const pending = useRef(new Map<string, Pending>());
  const frame = useRef<number | null>(null);
  // the callback identity changes across renders; read the live one at flush
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  const flush = useCallback(() => {
    frame.current = null;
    if (pending.current.size === 0) return;
    // drain into an array first: a send must not be able to observe (or mutate)
    // the buffer it is being drained from
    const batch = [...pending.current.values()];
    pending.current.clear();
    for (const p of batch) sendRef.current(p.blockIndex, p.paramIndex, p.effectId, p.value);
  }, []);

  useEffect(() => {
    // requestAnimationFrame stops firing in a hidden tab, which would strand
    // whatever was in flight when the user switched away. Send it now instead.
    function onHide() {
      if (document.visibilityState !== 'hidden') return;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      flush();
    }
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      // Flush on teardown too: an unmount mid-drag is still an edit the user
      // made, and dropping it would leave the device a value behind the app.
      flush();
    };
  }, [flush]);

  return useCallback(
    (blockIndex, paramIndex, effectId, value) => {
      pending.current.set(`${blockIndex}:${paramIndex}`, {
        blockIndex,
        paramIndex,
        effectId,
        value,
      });
      frame.current ??= requestAnimationFrame(flush);
    },
    [flush],
  );
}
