// Inline icons for slots whose exported Figma SVGs came back empty.
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export const Check = ({ size = 10 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" {...base} strokeWidth={2}><path d="M2 6.5l2.6 2.6L10 3.5" /></svg>
);
export const Undo = ({ size = 10 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" {...base} strokeWidth={1.8}><path d="M4.5 2.5L2 5l2.5 2.5M2 5h5a3 3 0 010 6H5" /></svg>
);
export const Close = ({ size = 9 }) => (
  <svg width={size} height={size} viewBox="0 0 10 10" {...base} strokeWidth={1.8}><path d="M1.5 1.5l7 7m0-7l-7 7" /></svg>
);
export const ChevronDown = ({ size = 8 }) => (
  <svg width={size} height={size * 0.62} viewBox="0 0 8 5" {...base} strokeWidth={1.5}><path d="M1 1l3 3 3-3" /></svg>
);
export const List = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" {...base}><path d="M1.5 3h9M1.5 6h9M1.5 9h9" /></svg>
);
export const Compact = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" {...base}><rect x="1.5" y="1.5" width="9" height="3.2" rx=".8" /><rect x="1.5" y="7.3" width="9" height="3.2" rx=".8" /></svg>
);
export const Layers = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" {...base}><path d="M6 1.5l4.5 2.4L6 6.3 1.5 3.9 6 1.5zM1.5 6.2L6 8.6l4.5-2.4M1.5 8.4L6 10.8l4.5-2.4" /></svg>
);
export const Person = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" {...base}><circle cx="6" cy="4" r="2.2" /><path d="M1.8 10.5c.5-2 2.2-3 4.2-3s3.7 1 4.2 3" /></svg>
);

// Stat-card glyphs
export const IconStack = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" {...base} stroke="#98a2b3"><path d="M6 1.5l4.5 2.4L6 6.3 1.5 3.9 6 1.5zM1.5 6.2L6 8.6l4.5-2.4" /></svg>
);
export const IconClock = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" {...base} stroke="#4b41e1"><circle cx="6" cy="6" r="4.5" /><path d="M6 3.5V6l1.8 1.1" /></svg>
);
export const IconWrench = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" {...base} stroke="#069669"><path d="M7.4 2.3a2.5 2.5 0 00-2.9 3.2L1.6 8.4a1 1 0 001.4 1.4l2.9-2.9a2.5 2.5 0 003.2-2.9L7.4 5.3 6.2 4.1l1.2-1.8z" /></svg>
);
export const IconShield = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" {...base} stroke="#0d9488"><path d="M6 1.2l4 1.5v3c0 2.4-1.7 4-4 4.8-2.3-.8-4-2.4-4-4.8v-3l4-1.5z" /><path d="M4.2 6l1.3 1.3L8 4.8" /></svg>
);
