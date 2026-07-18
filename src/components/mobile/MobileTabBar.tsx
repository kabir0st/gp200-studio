import { ActionIcon, type ActionIconName } from '@/components/board/ActionIcon';

export type MobileTab = 'chain' | 'patches' | 'loop' | 'drums' | 'device';

const TABS: { id: MobileTab; label: string; icon: ActionIconName }[] = [
  { id: 'chain', label: 'CHAIN', icon: 'fxloop' },
  { id: 'patches', label: 'PATCHES', icon: 'patches' },
  { id: 'loop', label: 'LOOP', icon: 'loop' },
  { id: 'drums', label: 'DRUMS', icon: 'drums' },
  { id: 'device', label: 'DEVICE', icon: 'connect' },
];

interface MobileTabBarProps {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
}

/**
 * Fixed bottom navigation. Sits in the thumb zone and is padded past the home
 * indicator, so the primary way to move around the app is always reachable
 * one-handed — the desktop equivalents are spread between the top bar and the
 * floating deck, neither of which survives a phone viewport.
 */
export function MobileTabBar({ active, onChange }: MobileTabBarProps) {
  return (
    <nav className="m-tabbar" aria-label="Sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`m-tab${tab.id === active ? ' active' : ''}`}
          aria-current={tab.id === active ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          <ActionIcon name={tab.icon} className="m-tab-icon" />
          <span className="m-tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
