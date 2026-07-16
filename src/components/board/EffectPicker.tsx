import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { getEffectsByModule, MODULE_COLORS } from '@/core/effectNames';
import { EFFECT_DESCRIPTIONS } from '@/core/effectDescriptions';
import { Dialog } from '@/components/ui/Dialog';
import { pedalArtUrl, type ManifestIndex, type PedalArtEntry } from './pedalManifest';

interface EffectPickerProps {
  open: boolean;
  /** slot module (PRE, AMP, CAB, ...) that scopes the selectable effects */
  module: string;
  currentEffectId: number;
  artIndex: ManifestIndex | null;
  onSelect: (effectId: number) => void;
  onClose: () => void;
}

interface PickerRow {
  effectId: number;
  name: string;
  /** effect type from the art manifest ("Overdrive", "Clean Amp", …); "Other" when unmapped */
  type: string;
  /** real-world gear this effect emulates */
  basedOn: string;
  art: PedalArtEntry | undefined;
}

interface Category {
  type: string;
  count: number;
}

const ALL = 'All';
const OTHER = 'Other';

/** Every selectable effect for the module, decorated with its art + caption. */
function buildRows(module: string, artIndex: ManifestIndex | null): PickerRow[] {
  const effects = getEffectsByModule(module);
  return effects.map((effect) => {
    const art = artIndex?.get(`${module}::${effect.name}`);
    const basedOn = art?.basedOn ?? EFFECT_DESCRIPTIONS[effect.name] ?? '';
    return { effectId: effect.effectId, name: effect.name, type: art?.type ?? OTHER, basedOn, art };
  });
}

/** Distinct effect types with live counts; "Other" sorts last, never hardcoded. */
function buildCategories(rows: PickerRow[]): Category[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
  const categories = [...counts.entries()].map(([type, count]) => ({ type, count }));
  categories.sort((first, second) => {
    if (first.type === OTHER) return 1;
    if (second.type === OTHER) return -1;
    return first.type.localeCompare(second.type);
  });
  return categories;
}

function matchesQuery(row: PickerRow, query: string): boolean {
  if (!query) return true;
  return `${row.name} ${row.basedOn} ${row.type}`.toLowerCase().includes(query);
}

interface Group {
  type: string;
  rows: PickerRow[];
}

/** Bucket visible rows by type, ordered to match the category rail. */
function groupRows(rows: PickerRow[], categories: Category[]): Group[] {
  const byType = new Map<string, PickerRow[]>();
  for (const row of rows) {
    const bucket = byType.get(row.type) ?? [];
    bucket.push(row);
    byType.set(row.type, bucket);
  }
  const groups: Group[] = [];
  for (const category of categories) {
    const bucket = byType.get(category.type);
    if (bucket && bucket.length > 0) groups.push({ type: category.type, rows: bucket });
  }
  return groups;
}

function Thumb({ art, name, accent }: { art: PedalArtEntry | undefined; name: string; accent: string }) {
  if (art) {
    return <img className="ep-thumb-img" src={pedalArtUrl(art)} alt="" loading="lazy" />;
  }
  return (
    <span className="ep-thumb-fallback" style={{ color: accent }}>
      {name.slice(0, 2)}
    </span>
  );
}

/** Guitar Rig style effect browser: category rail + search + list of art tiles. */
export function EffectPicker({
  open,
  module,
  currentEffectId,
  artIndex,
  onSelect,
  onClose,
}: EffectPickerProps) {
  const rows = useMemo(() => buildRows(module, artIndex), [module, artIndex]);
  const categories = useMemo(() => buildCategories(rows), [rows]);

  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // fresh filters each time the browser opens for a (possibly different) slot
  useEffect(() => {
    if (!open) return;
    setCategory(ALL);
    setQuery('');
  }, [open, module]);

  // bring the current effect into view once the list has rendered
  useEffect(() => {
    if (open) selectedRef.current?.scrollIntoView({ block: 'center' });
  }, [open]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = rows.filter((row) => {
    const inCategory = category === ALL || row.type === category;
    return inCategory && matchesQuery(row, normalizedQuery);
  });
  const groups = groupRows(visibleRows, categories);

  const accent = (MODULE_COLORS[module] ?? MODULE_COLORS.VOL).accent;
  const pickerStyle = { '--ep-accent': accent } as CSSProperties;

  function railClass(target: string): string {
    const classes = ['ep-cat'];
    if (category === target) classes.push('active');
    return classes.join(' ');
  }

  function handleSelect(effectId: number) {
    onSelect(effectId);
    onClose();
  }

  // ↑/↓ move focus between visible tiles; Home/End jump to the ends
  function handleListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const tiles = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('.ep-row') ?? [])];
    if (tiles.length === 0) return;
    event.preventDefault();
    const current = tiles.indexOf(document.activeElement as HTMLButtonElement);
    const targets: Record<string, number> = {
      ArrowDown: Math.min(current + 1, tiles.length - 1),
      ArrowUp: Math.max(current - 1, 0),
      Home: 0,
      End: tiles.length - 1,
    };
    tiles[targets[event.key]]?.focus();
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Choose ${module} effect`} maxWidth="max-w-4xl">
      <div className="effect-picker" style={pickerStyle}>
        <header className="ep-head">
          <div className="ep-title">
            <span className="ep-title-kicker">Change effect</span>
            <span className="ep-title-module">{module}</span>
          </div>
          <input
            className="ep-search"
            type="search"
            placeholder="Search effects or gear…"
            value={query}
            aria-label={`Search ${module} effects`}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="ep-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="ep-body">
          <nav className="ep-rail" aria-label="Effect categories">
            <button type="button" className={railClass(ALL)} onClick={() => setCategory(ALL)}>
              <span>All</span>
              <span className="ep-cat-count">{rows.length}</span>
            </button>
            {categories.map((cat) => (
              <button
                key={cat.type}
                type="button"
                className={railClass(cat.type)}
                onClick={() => setCategory(cat.type)}
              >
                <span>{cat.type}</span>
                <span className="ep-cat-count">{cat.count}</span>
              </button>
            ))}
          </nav>

          <div className="ep-list" ref={listRef} onKeyDown={handleListKeyDown}>
            {groups.length === 0 && <p className="ep-empty">No effects match “{query}”.</p>}
            {groups.map((group) => (
              <section key={group.type} className="ep-group">
                <h3 className="ep-group-head">
                  {group.type}
                  <span className="ep-group-count">{group.rows.length}</span>
                </h3>
                {group.rows.map((row) => {
                  const selected = row.effectId === currentEffectId;
                  const rowClasses = ['ep-row'];
                  if (selected) rowClasses.push('selected');
                  return (
                    <button
                      key={row.effectId}
                      type="button"
                      ref={(node) => {
                        if (selected) selectedRef.current = node;
                      }}
                      className={rowClasses.join(' ')}
                      aria-current={selected}
                      onClick={() => handleSelect(row.effectId)}
                    >
                      <span className="ep-thumb">
                        <Thumb art={row.art} name={row.name} accent={accent} />
                      </span>
                      <span className="ep-text">
                        <span className="ep-name">{row.name}</span>
                        {row.basedOn && <span className="ep-based">{row.basedOn}</span>}
                      </span>
                      <span className="ep-type-badge">{row.type}</span>
                    </button>
                  );
                })}
              </section>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
