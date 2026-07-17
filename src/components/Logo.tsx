/**
 * GP200 Studio mark: the Valeton GP-200 floor unit, simplified to five
 * shapes: enclosure, LCD, knobs, LED, footswitches. Colors are fixed like the
 * pedals themselves (physical object, renders identically in both themes;
 * LCD stays green-phosphor per docs/board-design-system.md).
 */
export function Logo({ size = 56 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={(size * 40) / 64}
      viewBox="0 0 64 40"
      role="img"
      aria-label="GP200 Studio"
    >
      <rect x="1" y="1" width="62" height="38" rx="8" fill="#232220" />
      <rect x="1" y="1" width="62" height="38" rx="8" fill="none" stroke="#4a463f" strokeWidth="1.5" />
      {/* LCD */}
      <rect x="8" y="8" width="24" height="11" rx="2" fill="#0c1a0e" />
      <rect x="11" y="11.5" width="15" height="1.8" rx="0.9" fill="#5df08a" />
      <rect x="11" y="15" width="9" height="1.8" rx="0.9" fill="#5df08a" opacity="0.55" />
      {/* knobs */}
      <circle cx="42" cy="13.5" r="4.6" fill="#8a857c" />
      <rect x="41.4" y="9.4" width="1.2" height="4" rx="0.6" fill="#232220" />
      <circle cx="54" cy="13.5" r="4.6" fill="#8a857c" />
      <rect x="53.4" y="9.4" width="1.2" height="4" rx="0.6" fill="#232220" />
      {/* LED */}
      <circle cx="8.5" cy="26.5" r="1.6" fill="#d9a13c" />
      {/* footswitches */}
      <circle cx="16" cy="30" r="4" fill="none" stroke="#b0aca3" strokeWidth="2" />
      <circle cx="32" cy="30" r="4" fill="none" stroke="#b0aca3" strokeWidth="2" />
      <circle cx="48" cy="30" r="4" fill="none" stroke="#b0aca3" strokeWidth="2" />
    </svg>
  );
}
