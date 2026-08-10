import { useLayoutEffect, useRef, useState } from 'react';
import { motionDurations } from '@/lib/motion';

interface CableLayerProps {
  /** module names in chain order: labels the cross-row stub cables */
  modules: string[];
  /** joined slotIndex order; any change (reorder) re-measures the jacks */
  orderKey: string;
  /** hide while a pedal drag is in flight (geometry is stale mid-drag) */
  hidden: boolean;
}

interface Plug {
  x: number;
  y: number;
}

interface Segment {
  d: string;
  plugs: Plug[];
  label?: { text: string; x: number; y: number; anchor: 'start' | 'end' | 'middle' };
}

/**
 * Patch cables between consecutive pedals, drawn over the stage. Neighbours on
 * the same wrapped line get a drooping bezier; a line break gets two short
 * labeled stubs (a full cable back across the board would cross the pedals).
 * Port of the mockup's drawCables().
 */
export function CableLayer({ modules, orderKey, hidden }: CableLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [segments, setSegments] = useState<Segment[]>([]);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const stage = svg?.parentElement;
    if (!svg || !stage) return;

    const measure = () => {
      const sr = stage.getBoundingClientRect();
      if (sr.width === 0) return;
      const nodes = [...stage.querySelectorAll<HTMLElement>('[data-chain]')].sort(
        (a, b) => Number(a.dataset.chain) - Number(b.dataset.chain),
      );

      const jackPos = (el: HTMLElement, sel: string): Plug | null => {
        const j = el.querySelector(sel);
        if (!j) return null;
        const r = j.getBoundingClientRect();
        return { x: r.left + r.width / 2 - sr.left, y: r.top + r.height / 2 - sr.top };
      };

      // Which wrapped line a pedal ended up on, measured rather than declared:
      // the chain is one flex row that wraps, so how many pedals share a line
      // depends on the window width and the current fit scale. The bay (the
      // pedal's parent) stretches to its line's height, so bays on one line
      // share a top edge; the pedals themselves are bottom-aligned in bays of
      // differing height, so their own tops don't line up.
      const lineOf = (el: HTMLElement) => {
        const box = el.parentElement ?? el;
        return Math.round(box.getBoundingClientRect().top);
      };

      const segs: Segment[] = [];
      // A stub points off the end of its line, so the room it needs is at the
      // board's edge , exactly where there is least of it. Cable and label are
      // budgeted separately: the tail is 30px, the label another ~44 beyond it.
      // The row reserves side padding for the tail (board.css); when the label
      // won't also fit it goes under the plug rather than across the pedal.
      const TAIL = 34;
      const TAIL_AND_LABEL = 80;
      const stub = (p: Plug, dir: 1 | -1, text: string) => {
        let dx = dir;
        if (dx < 0 && p.x - TAIL < 0) dx = 1; // no room to the left
        if (dx > 0 && p.x + TAIL > sr.width) dx = -1; // no room to the right
        const labelFits = dx > 0 ? p.x + TAIL_AND_LABEL <= sr.width : p.x - TAIL_AND_LABEL >= 0;
        let label: Segment['label'] = { text, x: p.x, y: p.y + 32, anchor: 'middle' };
        if (labelFits) {
          label = { text, x: p.x + 36 * dx, y: p.y + 19, anchor: dx > 0 ? 'start' : 'end' };
        }
        segs.push({
          d: `M ${p.x} ${p.y} c ${8 * dx} 12, ${20 * dx} 16, ${30 * dx} 16`,
          plugs: [p],
          label,
        });
      };

      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i];
        const b = nodes[i + 1];
        const p0 = jackPos(a, '[data-jack="out"]');
        const p1 = jackPos(b, '[data-jack="in"]');
        if (!p0 || !p1) continue;
        if (Math.abs(lineOf(a) - lineOf(b)) <= 2) {
          const droop = 24 + Math.min(56, Math.hypot(p1.x - p0.x, p1.y - p0.y) * 0.12);
          segs.push({
            d: `M ${p0.x} ${p0.y} C ${p0.x} ${p0.y + droop}, ${p1.x} ${p1.y + droop}, ${p1.x} ${p1.y}`,
            plugs: [p0, p1],
          });
        } else {
          const toModule = modules[i + 1] ?? '?';
          const fromModule = modules[i] ?? '?';
          stub(p0, 1, `→ ${toModule}`);
          stub(p1, -1, `${fromModule} →`);
        }
      }

      setSize({ w: sr.width, h: sr.height });
      setSegments(segs);
    };

    measure();
    // re-measure after the reorder FLIP settles so cables meet the pedals at
    // their final rest positions (the animation is transform-based, so a
    // ResizeObserver won't catch it on its own)
    const raf = requestAnimationFrame(measure);
    const settle = window.setTimeout(measure, motionDurations.base * 1000 + 60);
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      ro.disconnect();
    };
  }, [modules, orderKey]);

  return (
    <svg
      ref={svgRef}
      className={`cables-svg${hidden ? ' cables-hidden' : ''}`}
      viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}
      aria-hidden="true"
    >
      <defs>
        {/* soft ground shadow so wires read as lifted off the board */}
        <filter id="cable-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#000" floodOpacity="0.35" />
        </filter>
        {/* rubber sheath: dark core with a lengthwise highlight */}
        <linearGradient id="cable-sheath" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a3a3d" />
          <stop offset="45%" stopColor="#1a1a1c" />
          <stop offset="100%" stopColor="#0a0a0b" />
        </linearGradient>
        <radialGradient id="plug-metal" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#f0f0f0" />
          <stop offset="55%" stopColor="#a8a8a8" />
          <stop offset="100%" stopColor="#4a4a4a" />
        </radialGradient>
      </defs>
      {segments.map((seg, i) => (
        <g key={i} filter="url(#cable-shadow)">
          {/* casing → sheath → glossy sheen for a rounded rubber cable */}
          <path d={seg.d} fill="none" stroke="#050505" strokeWidth={6.5} strokeLinecap="round" />
          <path d={seg.d} fill="none" stroke="url(#cable-sheath)" strokeWidth={5} strokeLinecap="round" />
          <path
            d={seg.d}
            fill="none"
            stroke="#8f9094"
            strokeWidth={1.2}
            strokeLinecap="round"
            opacity={0.5}
          />
          {seg.plugs.map((p, j) => (
            <g key={j}>
              <circle cx={p.x} cy={p.y} r={5} fill="url(#plug-metal)" stroke="#2c2c2c" strokeWidth={0.75} />
              <circle cx={p.x} cy={p.y} r={2} fill="#1e1e1e" />
              <circle cx={p.x - 1.3} cy={p.y - 1.3} r={0.9} fill="#fff" opacity={0.7} />
            </g>
          ))}
          {seg.label && (
            <text x={seg.label.x} y={seg.label.y} textAnchor={seg.label.anchor} letterSpacing={1}>
              {seg.label.text}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
