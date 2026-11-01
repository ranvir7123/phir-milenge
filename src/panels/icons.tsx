// Line icons the panels use (same drawings as docs/mockups/all-screens.html). The warning icon is always followed by words.

import type { ReactNode } from 'react';

function Icon({ children, label, size = 20 }: { children: ReactNode; label?: string; size?: number }) {
  return (
    <svg
      className="pn-i"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {children}
    </svg>
  );
}

export const AlertIcon = (p: { size?: number }) => (
  <Icon size={p.size}>
    <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3" />
    <path d="M12 9v4M12 17h.01" />
  </Icon>
);

export const PairIcon = (p: { size?: number }) => (
  <Icon size={p.size}>
    <path d="M8 3v18M16 3v18" />
    <path d="M3 8h5M16 16h5" />
  </Icon>
);

export const LeftIcon = (p: { size?: number }) => (
  <Icon size={p.size}>
    <path d="m15 18-6-6 6-6" />
  </Icon>
);

export const RightIcon = (p: { size?: number }) => (
  <Icon size={p.size}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);

export const ShieldIcon = (p: { size?: number }) => (
  <Icon size={p.size}>
    <path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

export const BeamIcon = (p: { size?: number }) => (
  <Icon size={p.size}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3zM21 14v.01M14 21h.01M17 21h4v-4" />
  </Icon>
);

export const PlayIcon = (p: { size?: number }) => (
  <Icon size={p.size}>
    <path d="M7 4.5v15a.8.8 0 0 0 1.2.7l12-7.5a.8.8 0 0 0 0-1.4l-12-7.5A.8.8 0 0 0 7 4.5z" />
  </Icon>
);

export const PauseIcon = (p: { size?: number }) => (
  <Icon size={p.size}>
    <path d="M8 4v16M16 4v16" />
  </Icon>
);

export const CloseIcon = (p: { size?: number }) => (
  <Icon size={p.size}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const CheckIcon = (p: { size?: number }) => (
  <Icon size={p.size}>
    <path d="m5 12 5 5 9-10" />
  </Icon>
);

/** The little painted lorry that drives across after a catch. Not the truck back. */
export function LorryArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 34" aria-hidden="true">
      <rect x="2" y="4" width="38" height="20" rx="2" fill="var(--text)" />
      <path d="M40 10h12l8 8v6H40z" fill="var(--text)" />
      <rect x="44" y="12" width="7" height="6" fill="var(--page)" />
      <circle cx="14" cy="27" r="5" fill="var(--page)" stroke="var(--text)" strokeWidth="2" />
      <circle cx="50" cy="27" r="5" fill="var(--page)" stroke="var(--text)" strokeWidth="2" />
      <path d="M8 10h26M8 16h18" stroke="var(--page)" strokeWidth="2" />
    </svg>
  );
}
