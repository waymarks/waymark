import type { SVGProps } from 'react';

type IconName =
  | 'actions'
  | 'sessions'
  | 'approvals'
  | 'policy'
  | 'stats'
  | 'team'
  | 'settings'
  | 'search'
  | 'chevron'
  | 'x'
  | 'gear'
  | 'bell'
  | 'external'
  | 'plus'
  | 'trash'
  | 'rollback'
  | 'check'
  | 'command'
  | 'filter'
  | 'menu'
  | 'shield'
  | 'doc'
  | 'folder'
  | 'sliders'
  | 'sun'
  | 'moon'
  | 'eye'
  | 'agent';

const PATHS: Record<IconName, JSX.Element> = {
  actions:  <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />,
  sessions: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  approvals:<><path d="M9 12l2 2 4-4" /><path d="M21 12c0 5-4 9-9 9s-9-4-9-9 4-9 9-9c2 0 4 .5 5.5 1.5" /></>,
  policy:   <path d="M12 2L3 6v6c0 5 4 9 9 10 5-1 9-5 9-10V6l-9-4z" />,
  stats:    <><path d="M3 20V10" /><path d="M9 20V4" /><path d="M15 20v-8" /><path d="M21 20v-12" /></>,
  team:     <><circle cx="9" cy="8" r="4" /><path d="M2 22c0-4 3-7 7-7s7 3 7 7" /><circle cx="17" cy="7" r="3" /><path d="M15 15c3 0 7 2 7 7" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
  search:   <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  chevron:  <path d="M6 9l6 6 6-6" />,
  x:        <path d="M6 6l12 12M6 18L18 6" />,
  gear:     <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
  bell:     <><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 004 0" /></>,
  external: <><path d="M14 3h7v7" /><path d="M10 14L21 3" /><path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5" /></>,
  plus:     <path d="M12 5v14M5 12h14" />,
  trash:    <><path d="M3 6h18" /><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /><path d="M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" /></>,
  rollback: <><path d="M3 7v6h6" /><path d="M3 13a9 9 0 109-9" /></>,
  check:    <path d="M5 12l5 5L20 6" />,
  command:  <path d="M18 3a3 3 0 00-3 3v12a3 3 0 003 3 3 3 0 003-3 3 3 0 00-3-3H6a3 3 0 00-3 3 3 3 0 003 3 3 3 0 003-3V6a3 3 0 00-3-3 3 3 0 00-3 3 3 3 0 003 3h12a3 3 0 003-3 3 3 0 00-3-3z" />,
  filter:   <><path d="M4 6h16" /><path d="M7 12h10" /><path d="M10 18h4" /></>,
  menu:     <path d="M3 6h18M3 12h18M3 18h18" />,
  shield:   <path d="M12 2L3 6v6c0 5 4 9 9 10 5-1 9-5 9-10V6l-9-4z" />,
  doc:      <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></>,
  folder:   <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  sliders:  <><path d="M4 6h10" /><path d="M18 6h2" /><circle cx="16" cy="6" r="2" /><path d="M4 12h2" /><path d="M10 12h10" /><circle cx="8" cy="12" r="2" /><path d="M4 18h12" /><path d="M20 18h0" /><circle cx="18" cy="18" r="2" /></>,
  sun:      <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon:     <path d="M21 12.8A9 9 0 0111.2 3a7 7 0 109.8 9.8z" />,
  eye:      <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></>,
  agent:    <><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M8 8V6a4 4 0 018 0v2" /><circle cx="12" cy="15" r="2" /></>,
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

export type { IconName };
