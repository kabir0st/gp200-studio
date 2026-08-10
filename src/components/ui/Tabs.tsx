import { useRef } from 'react';
import type { KeyboardEvent } from 'react';

export interface TabDef {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: TabDef[];
  active: string;
  ariaLabel: string;
  onSelect: (id: string) => void;
}

const BASE_TAB_CLASSES =
  'font-mono-display text-label font-bold uppercase tracking-wider px-3 py-2 ' +
  'border-b-2 -mb-px transition-colors duration-150';

function tabClasses(selected: boolean): string {
  if (selected) {
    return `${BASE_TAB_CLASSES} text-accent-amber border-accent-amber`;
  }
  return (
    `${BASE_TAB_CLASSES} text-text-secondary border-transparent ` +
    'hover:text-text-primary'
  );
}

function tabIndexOf(selected: boolean): number {
  if (selected) {
    return 0;
  }
  return -1;
}

/**
 * Shared tab-bar primitive: an accessible `role="tablist"` strip with a
 * roving tabindex (ArrowLeft/ArrowRight cycle, Home/End jump). Hosts own the
 * active-tab state and render the matching content in a `role="tabpanel"`
 * container below.
 */
export function Tabs({ tabs, active, ariaLabel, onSelect }: TabsProps) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement | null>());

  function selectAndFocus(id: string) {
    onSelect(id);
    tabRefs.current.get(id)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const ids = tabs.map((tab) => tab.id);
    const activeIndex = ids.indexOf(active);
    if (activeIndex === -1) {
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      selectAndFocus(ids[(activeIndex + 1) % ids.length]);
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      selectAndFocus(ids[(activeIndex - 1 + ids.length) % ids.length]);
    }
    if (event.key === 'Home') {
      event.preventDefault();
      selectAndFocus(ids[0]);
    }
    if (event.key === 'End') {
      event.preventDefault();
      selectAndFocus(ids[ids.length - 1]);
    }
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-1 border-b border-border-active"
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              tabRefs.current.set(tab.id, node);
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={tabIndexOf(selected)}
            className={tabClasses(selected)}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
