import { useLayoutEffect, useRef, useState } from 'react';

interface CableLayerProps {
  /** module names in chain order — labels the cross-row stub cables */
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
  label?: { text: string; x: number; y: number; anchor: 'start' | 'end' };
}

/**
 * Patch cables between consecutive pedals, drawn over the stage. Same-row
 * neighbours get a drooping bezier; row breaks get short labeled stubs
 * (a full cable across rows would cross the pedals). Port of the mockup's
 * drawCables().
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

      const segs: Segment[] = [];
      const stub = (p: Plug, dir: 1 | -1, text: string) => {
        let dx = dir;
        if (dx < 0 && p.x - 80 < 0) dx = 1; // no room to the left
        if (dx > 0 && p.x + 80 > sr.width) dx = -1; // no room to the right
        segs.push({
          d: `M ${p.x} ${p.y} c ${8 * dx} 12, ${20 * dx} 16, ${30 * dx} 16`,
          plugs: [p],
          label: { text, x: p.x + 36 * dx, y: p.y + 19, anchor: dx > 0 ? 'start' : 'end' },
        });
      };

      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i];
        const b = nodes[i + 1];
        const p0 = jackPos(a, '[data-jack="out"]');
        const p1 = jackPos(b, '[data-jack="in"]');
        if (!p0 || !p1) continue;
        if (a.dataset.row === b.dataset.row) {
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
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [modules, orderKey]);

  return (
    <svg
      ref={svgRef}
      className={`cables-svg${hidden ? ' cables-hidden' : ''}`}
      viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}
      aria-hidden="true"
    >
      {segments.map((seg, i) => (
        <g key={i}>
          <path d={seg.d} fill="none" stroke="#0b0b0b" strokeWidth={5} strokeLinecap="round" opacity={0.9} />
          <path d={seg.d} fill="none" stroke="#454545" strokeWidth={2} strokeLinecap="round" />
          {seg.plugs.map((p, j) => (
            <g key={j}>
              <circle cx={p.x} cy={p.y} r={4.5} fill="#b8b8b8" stroke="#3a3a3a" />
              <circle cx={p.x} cy={p.y} r={2} fill="#2a2a2a" />
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
