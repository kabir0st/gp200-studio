import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/Button';
import { Led } from '@/components/ui/Badge';
import type { LooperApi, LooperTrack } from '@/hooks/useLooper';

// The loop station's track rack: one row per track, each holding that track's
// own controls above its own waveform.
//
// This used to be two lists , every waveform stacked in one canvas, then every
// track's mute/level/delete again underneath , so each track's name and bar
// count appeared twice, forty pixels apart, and the picture of a take was never
// next to the buttons that act on it. One row per track is the whole idea here.
//
// Two rendering surfaces, deliberately split by update rate:
//   CANVAS  the waveform. One per row, redrawn only when that track or the cycle
//           width actually changes , never per frame.
//   DOM     the playheads, the live record bar and the readout. Updated inside
//           one rAF via style/textContent writes, so a 60 Hz sweep never touches
//           React state or re-renders the tree (same approach as AudioMeters).
//
// Tiling is drawn honestly: a 1-bar take under a 4-bar cycle is painted four
// times, with repeats 2..n ghosted so you can see at a glance which track is
// holding the loop open and which are just repeating underneath it.

interface LooperTrackRackProps {
  looper: LooperApi;
  /** drop the per-track transport and bar count, leaving level / mute / delete */
  compact?: boolean;
}

/** Waveform height in CSS px. */
const LANE_H = 38;

interface Palette {
  grid: string;
  barLine: string;
  laneBg: string;
  take: string;
  importColor: string;
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
    take: token('--accent-green', '#2f7e4f'),
    importColor: token('--accent-amber', '#8a6320'),
    muted: token('--text-muted', '#5f5c55'),
  };
}

/** Opacity for a waveform, so state is readable without reading text. */
function laneAlpha(track: LooperTrack): number {
  if (track.muted) return 0.22;
  if (track.state === 'stopped') return 0.4;
  return 1;
}

/**
 * Paint one track across `cycleBars` bars of width.
 *
 * The inner loop walks output pixel columns rather than input samples: for each
 * column it maps x → position in the cycle → position within the track's own
 * content (modulo its bar count) → peak bucket. That draws the tiling for free
 * and costs one pass over the canvas width regardless of how long the audio is.
 */
function drawLane(
  ctx: CanvasRenderingContext2D,
  width: number,
  track: LooperTrack,
  cycleBars: number,
  palette: Palette,
): void {
  ctx.clearRect(0, 0, width, LANE_H);
  if (width <= 0) return;

  const barWidth = width / Math.max(1, cycleBars);

  ctx.fillStyle = palette.laneBg;
  ctx.fillRect(0, 0, width, LANE_H);

  // Bar grid inside the lane.
  ctx.fillStyle = palette.grid;
  for (let bar = 1; bar < cycleBars; bar++) {
    ctx.fillRect(Math.round(bar * barWidth), 0, 1, LANE_H);
  }

  const waveform = track.waveform;
  if (!waveform || waveform.max <= 0 || track.bars <= 0) return;

  const centre = LANE_H / 2;
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

    // Repeats past the first are ghosted: the track that reaches the far right
    // at full strength is the one setting the loop length.
    ctx.globalAlpha = alpha * (repeat === 0 ? 1 : 0.38);
    ctx.fillStyle = colour;
    ctx.fillRect(x, centre - amplitude, 1, Math.max(1, amplitude * 2));
  }
  ctx.globalAlpha = 1;

  // A firmer line at each repeat seam, so "this take restarts here" is visible.
  ctx.fillStyle = palette.barLine;
  for (let repeat = track.bars; repeat < cycleBars; repeat += track.bars) {
    ctx.fillRect(Math.round(repeat * barWidth), 0, 1, LANE_H);
  }
}

interface TrackWaveProps {
  track: LooperTrack;
  cycleBars: number;
  width: number;
}

/** One track's waveform. Its own canvas, so a row owns its picture. */
function TrackWave({ track, cycleBars, width }: TrackWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    // Back the canvas at device resolution so 1px waveform columns stay crisp
    // on a phone's 3x display, then draw in CSS pixels.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(LANE_H * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${LANE_H}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLane(ctx, width, track, cycleBars, readPalette(canvas));
  }, [track, cycleBars, width]);

  return <canvas ref={canvasRef} className="block" />;
}

interface RecordStatusProps {
  armed: boolean;
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

function trackRowClass(selected: boolean): string {
  const base = 'rounded-lg border bg-bg-hover overflow-hidden cursor-pointer';
  if (selected) return `${base} border-accent-amber`;
  return `${base} border-border-active`;
}

function playPauseLabel(state: string): string {
  if (state === 'playing') return 'Pause';
  return 'Play';
}

function muteVariant(muted: boolean): 'primary' | 'ghost' {
  if (muted) return 'primary';
  return 'ghost';
}

function barsLabel(bars: number): string {
  if (bars <= 0) return '—';
  if (bars === 1) return '1 bar';
  return `${bars} bars`;
}

export function LooperTrackRack({ looper, compact = false }: LooperTrackRackProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const recFillRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  /** Playhead elements by track id, registered by callback ref. */
  const playheadsRef = useRef(new Map<number, HTMLDivElement>());
  /** CSS-pixel width of the plotting area, tracked so redraws match layout. */
  const widthRef = useRef(0);
  // Width lives in state as well as a ref: the canvases are React children and
  // need a re-render to redraw, while the rAF sweep needs it without one.
  const [plotWidth, setPlotWidth] = useState(0);

  const { tracks, cycleBars, selectedTrack, ready } = looper;

  const measure = useCallback((width: number) => {
    if (Math.abs(width - widthRef.current) < 0.5) return;
    widthRef.current = width;
    setPlotWidth(width);
  }, [setPlotWidth]);

  // Track the plotting area's width. The panel is used at both board and phone
  // widths, and the phone tab can mount at a width that changes as the sheet
  // settles, so this has to observe rather than measure once.
  useEffect(() => {
    const host = listRef.current;
    if (!host) return;
    // jsdom has no ResizeObserver; fall back to a one-shot measure so the
    // component still renders under test instead of throwing on mount.
    if (typeof ResizeObserver === 'undefined') {
      measure(host.getBoundingClientRect().width);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      measure(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [measure]);

  // `looper` is a fresh object every render, so the rAF loop reads it through a
  // ref instead of closing over it , otherwise the animation would be torn down
  // and rebuilt on every unrelated state change in the panel.
  const looperRef = useRef(looper);
  looperRef.current = looper;

  // The only per-frame work: sweep every row's playhead, grow the live record
  // bar and update the readout. All direct DOM writes , no state, no re-render.
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    const tick = () => {
      const api = looperRef.current;
      // One position for every row: the tracks share a transport, so they share
      // a playhead , it is just drawn once per row because the control strips
      // between the waveforms would break a single line drawn down the rack.
      const x = api.getPlayhead() * widthRef.current;
      const transform = `translateX(${x.toFixed(1)}px)`;
      for (const el of playheadsRef.current.values()) el.style.transform = transform;

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

  const registerPlayhead = (id: number) => (el: HTMLDivElement | null) => {
    if (el) playheadsRef.current.set(id, el);
    else playheadsRef.current.delete(id);
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Bar ruler. The waveforms are full-bleed inside their rows, so the only
          inset to match is the row's 1px border. */}
      {tracks.length > 0 && (
        <div className="flex px-px">
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
      )}

      <div ref={listRef} className="flex flex-col gap-2">
        {tracks.map((trackRow, index) => {
          const selected = trackRow.id === selectedTrack;
          const recordingThis = looper.recordArmedTrack === trackRow.id;
          const live = trackRow.state === 'playing' || trackRow.state === 'recording';
          return (
            <div
              key={trackRow.id}
              className={trackRowClass(selected)}
              onClick={() => looper.selectTrack(trackRow.id)}
            >
              {/* The controls for this track, directly above its picture. */}
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <Led active={live} />
                <span
                  className="font-mono-display text-label text-text-secondary w-24 truncate"
                  title={trackRow.label}
                >
                  {trackRow.label}
                </span>
                {!compact && (
                  <span className="font-mono-display text-micro text-text-muted tabular-nums w-14">
                    {barsLabel(trackRow.bars)}
                  </span>
                )}
                {recordingThis && trackRow.state === 'armed' && (
                  <span className="font-mono-display text-caption text-accent-red">◌ armed</span>
                )}
                {recordingThis && trackRow.state !== 'armed' && (
                  <span className="font-mono-display text-caption text-accent-red">● recording</span>
                )}
                {!compact && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!trackRow.hasAudio}
                    onClick={() => looper.togglePlay(trackRow.id)}
                  >
                    {playPauseLabel(trackRow.state)}
                  </Button>
                )}
                <Button
                  variant={muteVariant(trackRow.muted)}
                  size="sm"
                  disabled={!trackRow.hasAudio}
                  onClick={() => looper.setMute(trackRow.id, !trackRow.muted)}
                >
                  Mute
                </Button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={trackRow.gain}
                  disabled={!trackRow.hasAudio}
                  onChange={(event) =>
                    looper.updateTrackGain(trackRow.id, Number(event.target.value))
                  }
                  className="order-last basis-full sm:order-none sm:basis-0 sm:flex-1
                    min-w-0 accent-accent-amber"
                  aria-label={`Track ${index + 1} level`}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto sm:ml-0"
                  onClick={() => looper.clear(trackRow.id)}
                  title="Delete this track"
                >
                  ✕
                </Button>
              </div>

              {/* This track's waveform, plus the live overlays that sit on it. */}
              <div className="relative" style={{ height: LANE_H }}>
                <TrackWave track={trackRow} cycleBars={cycleBars} width={plotWidth} />

                {recordingThis && (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
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
                        armed={trackRow.state === 'armed'}
                        listening={looper.isListening}
                        readoutRef={readoutRef}
                      />
                    </span>
                  </div>
                )}

                <div
                  ref={registerPlayhead(trackRow.id)}
                  className="absolute top-0 bottom-0 w-px bg-accent-amber pointer-events-none
                    shadow-glow-amber"
                  style={{ transform: 'translateX(0px)', willChange: 'transform' }}
                />
              </div>
            </div>
          );
        })}

        {tracks.length === 0 && (
          <div
            className="flex items-center justify-center rounded-lg
              border border-dashed border-border-active"
            style={{ height: LANE_H * 2 }}
          >
            <span className="font-mono-display text-caption text-text-muted px-2 text-center">
              Import a backing track, or hit ● REC to lay down the first loop
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
