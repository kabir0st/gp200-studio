import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { LooperApi, LooperTrack } from '@/hooks/useLooper';

// The loop station's visual: one waveform lane per track, laid out across the
// full cycle, with a single playhead sweeping all of them together.
//
// Two rendering surfaces, deliberately split by update rate:
//   CANVAS  the waveform lanes. Redrawn only when the tracks or the cycle width
//           actually change , never per frame.
//   DOM     the playhead, the live record bar and the live readout. Updated
//           inside one rAF via style/textContent writes, so a 60 Hz sweep never
//           touches React state or re-renders the tree (same approach as
//           AudioMeters and the LooperPanel progress bar).
//
// Tiling is drawn honestly: a 1-bar take under a 4-bar cycle is painted four
// times, with repeats 2..n ghosted so you can see at a glance which lane is
// holding the loop open and which are just repeating underneath it.

interface LooperTimelineProps {
  looper: LooperApi;
}

/** Lane height in CSS px, and the gap between lanes. */
const LANE_H = 38;
const LANE_GAP = 4;
/** Left gutter for lane labels; the canvas starts after it. */
const GUTTER = 84;

interface Palette {
  grid: string;
  barLine: string;
  laneBg: string;
  laneBgSelected: string;
  take: string;
  importColor: string;
  recording: string;
  muted: string;
}

function readPalette(el: HTMLElement): Palette {
  const css = getComputedStyle(el);
  const token = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback;
  return {
    grid: token('--border-subtle', '#cbc7be'),
    barLine: token('--border-active', '#aaa69d'),
    laneBg: token('--bg-deep', '#ccc9c1'),
    laneBgSelected: token('--bg-hover', '#e2dfd8'),
    take: token('--accent-green', '#2f7e4f'),
    importColor: token('--accent-amber', '#8a6320'),
    recording: token('--accent-red', '#b4423a'),
    muted: token('--text-muted', '#5f5c55'),
  };
}

/** Opacity for a lane's waveform, so state is readable without reading text. */
function laneAlpha(track: LooperTrack): number {
  if (track.muted) return 0.22;
  if (track.state === 'stopped') return 0.4;
  return 1;
}

/**
 * Paint every track lane across `cycleBars` bars of width.
 *
 * The inner loop walks output pixel columns rather than input samples: for each
 * column it maps x → position in the cycle → position within the track's own
 * content (modulo its bar count) → peak bucket. That draws the tiling for free
 * and costs one pass over the canvas width regardless of how long the audio is.
 */
function drawLanes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tracks: LooperTrack[],
  cycleBars: number,
  selectedTrack: number | null,
  palette: Palette,
): void {
  ctx.clearRect(0, 0, width, height);
  if (width <= 0 || height <= 0) return;

  const barWidth = width / Math.max(1, cycleBars);

  tracks.forEach((track, lane) => {
    const top = lane * (LANE_H + LANE_GAP);
    const selected = track.id === selectedTrack;

    ctx.fillStyle = selected ? palette.laneBgSelected : palette.laneBg;
    ctx.fillRect(0, top, width, LANE_H);

    // Bar grid inside the lane.
    ctx.fillStyle = palette.grid;
    for (let bar = 1; bar < cycleBars; bar++) {
      ctx.fillRect(Math.round(bar * barWidth), top, 1, LANE_H);
    }

    const waveform = track.waveform;
    if (!waveform || waveform.max <= 0 || track.bars <= 0) return;

    const centre = top + LANE_H / 2;
    const halfHeight = LANE_H / 2 - 3;
    const { peaks, max } = waveform;
    const colour = track.kind === 'import' ? palette.importColor : palette.take;
    const alpha = laneAlpha(track);

    for (let x = 0; x < width; x++) {
      // Where this column sits in the cycle, in bars.
      const cyclePos = (x / width) * cycleBars;
      const repeat = Math.floor(cyclePos / track.bars);
      // …and where that lands inside the track's own content.
      const withinContent = (cyclePos % track.bars) / track.bars;
      const bucket = Math.min(peaks.length - 1, Math.floor(withinContent * peaks.length));
      const amplitude = (peaks[bucket] / max) * halfHeight;

      // Repeats past the first are ghosted: the lane that reaches the far right
      // at full strength is the one setting the loop length.
      ctx.globalAlpha = alpha * (repeat === 0 ? 1 : 0.38);
      ctx.fillStyle = colour;
      ctx.fillRect(x, centre - amplitude, 1, Math.max(1, amplitude * 2));
    }
    ctx.globalAlpha = 1;

    // A firmer line at each repeat seam, so "this take restarts here" is visible.
    ctx.fillStyle = palette.barLine;
    for (let repeat = track.bars; repeat < cycleBars; repeat += track.bars) {
      ctx.fillRect(Math.round(repeat * barWidth), top, 1, LANE_H);
    }
  });
}

interface RecordStatusProps {
  armed: boolean | undefined;
  listening: boolean;
  readoutRef: RefObject<HTMLSpanElement | null>;
}

/** What the red overlay says while a take is live. Three states, because
 *  "nothing is happening yet" and "we are waiting for YOU" are different
 *  things and the player has to be able to tell them apart at a glance. */
function RecordStatus({ armed, listening, readoutRef }: RecordStatusProps) {
  if (listening) return <span>◌ LISTENING , starts on your first note</span>;
  if (armed) return <span>◌ ARMED , starts on the downbeat</span>;
  return (
    <>
      <span>● REC</span>
      <span ref={readoutRef} />
    </>
  );
}

export function LooperTimeline({ looper }: LooperTimelineProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const recFillRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  /** CSS-pixel width of the plotting area, tracked so redraws match layout. */
  const widthRef = useRef(0);

  const { tracks, cycleBars, selectedTrack, ready } = looper;
  const laneCount = Math.max(tracks.length, 1);
  const height = laneCount * LANE_H + (laneCount - 1) * LANE_GAP;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const width = widthRef.current;
    if (width <= 0) return;

    // Back the canvas at device resolution so 1px waveform columns stay crisp
    // on a phone's 3x display, then draw in CSS pixels.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLanes(ctx, width, height, tracks, cycleBars, selectedTrack, readPalette(wrap));
  }, [tracks, cycleBars, selectedTrack, height]);

  // Track the plotting area's width. The panel is used at both board and phone
  // widths, and the phone tab can mount at a width that changes as the sheet
  // settles, so this has to observe rather than measure once.
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement ?? canvas;
    if (!host) return;
    // jsdom has no ResizeObserver; fall back to a one-shot measure so the
    // component still renders under test instead of throwing on mount.
    if (typeof ResizeObserver === 'undefined') {
      widthRef.current = host.getBoundingClientRect().width;
      redraw();
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      if (Math.abs(next - widthRef.current) < 0.5) return;
      widthRef.current = next;
      redraw();
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => { redraw(); }, [redraw]);

  // `looper` is a fresh object every render, so the rAF loop reads it through a
  // ref instead of closing over it , otherwise the animation would be torn down
  // and rebuilt on every unrelated state change in the panel.
  const looperRef = useRef(looper);
  looperRef.current = looper;

  // The only per-frame work: sweep the playhead, grow the live record bar and
  // update the readout. All direct DOM writes , no state, no re-render.
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    const tick = () => {
      const api = looperRef.current;
      const playhead = playheadRef.current;
      if (playhead) {
        const x = api.getPlayhead() * widthRef.current;
        playhead.style.transform = `translateX(${x.toFixed(1)}px)`;
      }

      const elapsed = api.getRecordElapsedSec();
      const base = api.baseDurationSec;
      const target = api.settings.recordBars;
      const fill = recFillRef.current;
      if (fill) {
        // A fixed-length take fills against the length it will stop at; a free
        // one fills against the cycle and wraps, because passing the end means
        // the loop is about to grow by a bar.
        let fraction = 0;
        if (target !== null && base !== null && base > 0) {
          fraction = Math.min(1, elapsed / (base * target));
        } else if (api.cycleDurationSec !== null && api.cycleDurationSec > 0) {
          fraction = (elapsed % api.cycleDurationSec) / api.cycleDurationSec;
        }
        fill.style.width = `${(fraction * 100).toFixed(1)}%`;
      }
      const readout = readoutRef.current;
      if (readout) {
        let bars = 1;
        if (base !== null && base > 0) bars = Math.max(1, Math.round(elapsed / base));
        let suffix = ` · ${bars} bar`;
        if (bars !== 1) suffix += 's';
        if (target !== null) suffix = ` · bar ${Math.min(bars, target)} of ${target}`;
        readout.textContent = `${elapsed.toFixed(1)}s${suffix}`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  const recordingTrack = tracks.find(
    (track) => track.state === 'recording' || track.state === 'armed',
  );
  const recordingLane = recordingTrack ? tracks.indexOf(recordingTrack) : -1;

  return (
    <div ref={wrapRef} className="flex flex-col gap-1">
      {/* Bar ruler, aligned to the plotting area by the same gutter offset */}
      <div className="flex" style={{ paddingLeft: GUTTER }}>
        <div className="flex-1 flex min-w-0">
          {Array.from({ length: cycleBars }, (_, bar) => (
            <span
              key={bar}
              className="flex-1 min-w-0 font-mono-display text-micro text-text-muted
                border-l border-border-subtle pl-1 tabular-nums"
            >
              {bar + 1}
            </span>
          ))}
        </div>
      </div>

      <div className="flex">
        {/* Left gutter: one label block per lane, height-matched to the canvas */}
        <div className="shrink-0 flex flex-col" style={{ width: GUTTER, gap: LANE_GAP }}>
          {tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              onClick={() => looper.selectTrack(track.id)}
              style={{ height: LANE_H }}
              className={`flex flex-col justify-center items-start pr-2 rounded-l
                border-l-2 text-left overflow-hidden ${
                  track.id === selectedTrack
                    ? 'border-accent-amber bg-bg-hover'
                    : 'border-transparent'
                }`}
              title={track.label}
            >
              <span
                className="font-mono-display text-micro text-text-secondary truncate
                  max-w-full w-full"
              >
                {track.label}
              </span>
              <span className="font-mono-display text-micro text-text-muted tabular-nums">
                {track.bars > 0 ? `${track.bars} bar${track.bars === 1 ? '' : 's'}` : '—'}
                {track.muted && ' · MUTE'}
              </span>
            </button>
          ))}
        </div>

        {/* Plotting area: canvas + absolutely-positioned live overlays */}
        <div className="relative flex-1 min-w-0" style={{ height }}>
          <canvas ref={canvasRef} className="block" />

          {tracks.length === 0 && (
            <div
              className="absolute inset-0 flex items-center justify-center rounded
                border border-dashed border-border-active"
            >
              <span className="font-mono-display text-caption text-text-muted px-2 text-center">
                Import a backing track, or hit ● REC to lay down the first loop
              </span>
            </div>
          )}

          {/* Live record bar, sitting exactly over the recording track's lane */}
          {recordingLane >= 0 && (
            <div
              className="absolute left-0 right-0 pointer-events-none overflow-hidden rounded-sm"
              style={{ top: recordingLane * (LANE_H + LANE_GAP), height: LANE_H }}
            >
              <div
                ref={recFillRef}
                className="h-full bg-accent-red/30 border-r-2 border-accent-red"
                style={{ width: '0%' }}
              />
              <span
                className="absolute inset-y-0 left-2 flex items-center gap-2
                  font-mono-display text-micro text-accent-red tabular-nums"
              >
                <RecordStatus
                  armed={recordingTrack?.state === 'armed'}
                  listening={looper.isListening}
                  readoutRef={readoutRef}
                />
              </span>
            </div>
          )}

          {/* Playhead: one line across every lane, moved by transform only */}
          {tracks.length > 0 && (
            <div
              ref={playheadRef}
              className="absolute top-0 bottom-0 w-px bg-accent-amber pointer-events-none
                shadow-glow-amber"
              style={{ transform: 'translateX(0px)', willChange: 'transform' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
