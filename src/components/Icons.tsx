interface IconProps {
  size?: number
  strokeWidth?: number
  className?: string
  style?: React.CSSProperties
  fill?: string
}

const base = (size: number): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export function TvIcon({ size = 24, strokeWidth = 1.8, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <path d="M4 8.5h16a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z" />
      <path d="m8 3 4 4 4-4" />
      <path d="M6.5 12.5v4" />
    </svg>
  )
}

export function ClapperboardIcon({ size = 24, strokeWidth = 1.8, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <path d="M3.5 9h17v9.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V9Z" />
      <path d="m4 9 1-3.2 15.5 1.6L20 9" />
      <path d="m8 5.2-1 3.6M12.5 5.6l-1 3.4M17 6l-1 3.2" />
    </svg>
  )
}

export function SearchIcon({ size = 24, strokeWidth = 1.8, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.8-3.8" />
    </svg>
  )
}

export function PersonIcon({ size = 24, strokeWidth = 1.8, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20c.6-4 3.5-6 7.5-6s6.9 2 7.5 6" />
    </svg>
  )
}

export function GridIcon({ size = 24, strokeWidth = 1.8, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
    </svg>
  )
}

export function ListIcon({ size = 24, strokeWidth = 1.8, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function BellIcon({ size = 24, strokeWidth = 1.8, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <path d="M6 9a6 6 0 0 1 12 0c0 4 1.2 5.4 2 6.4.4.5 0 1.1-.6 1.1H4.6c-.6 0-1-.6-.6-1.1.8-1 2-2.4 2-6.4Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  )
}

export function DotsIcon({ size = 24, strokeWidth = 1.8, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ChevronRight({ size = 24, strokeWidth = 2, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}

export function ChevronDown({ size = 24, strokeWidth = 2, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <path d="m5 9 7 7 7-7" />
    </svg>
  )
}

export function ChevronLeft({ size = 24, strokeWidth = 2, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <path d="m15 5-7 7 7 7" />
    </svg>
  )
}

export function PlusIcon({ size = 24, strokeWidth = 2, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function CheckIcon({ size = 24, strokeWidth = 2.2, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <path d="m5 12.5 4.5 4.5L19 6.5" />
    </svg>
  )
}

export function HeartIcon({ size = 24, strokeWidth = 1.8, fill = 'none', ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} fill={fill} {...p}>
      <path d="M12 20s-7-4.4-9.2-9C1.4 8 2.8 4.8 6 4.8c2 0 3.2 1.2 4 2.6.8-1.4 2-2.6 4-2.6 3.2 0 4.6 3.2 3.2 6.2C19 15.6 12 20 12 20Z" />
    </svg>
  )
}

export function ClockIcon({ size = 24, strokeWidth = 1.8, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

export function CalendarIcon({ size = 24, strokeWidth = 1.8, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <rect x="4" y="5.5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3.5v4M16 3.5v4" />
    </svg>
  )
}

export function ShareIcon({ size = 24, strokeWidth = 1.8, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <path d="M12 3.5v11" />
      <path d="m8 7 4-3.5L16 7" />
      <path d="M7 11H5.5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1H17" />
    </svg>
  )
}

export function CommentIcon({ size = 24, strokeWidth = 1.8, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <path d="M20 12.5c0 3.6-3.6 6.5-8 6.5-1 0-2-.15-2.9-.42L4 20l1.2-3.2C4.45 15.7 4 14.15 4 12.5 4 8.9 7.6 6 12 6s8 2.9 8 6.5Z" />
    </svg>
  )
}

export function PeopleIcon({ size = 24, strokeWidth = 1.8, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19c.5-3.2 2.8-4.8 5.5-4.8s5 1.6 5.5 4.8" />
      <path d="M16 5.5a3 3 0 0 1 0 6M17.5 14.4c2 .5 3.4 1.9 3.8 4.1" />
    </svg>
  )
}

export function PlayIcon({ size = 24, strokeWidth = 1.8, fill = 'none', ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} fill={fill} {...p}>
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  )
}

export function StarIcon({ size = 24, strokeWidth = 1.8, fill = 'none', ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} fill={fill} {...p}>
      <path d="m12 4 2.35 4.9 5.4.72-3.95 3.72 1 5.36L12 16.9l-4.8 2.6 1-5.36L4.25 10.42l5.4-.72L12 4Z" />
    </svg>
  )
}

export function FilterIcon({ size = 24, strokeWidth = 1.8, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  )
}

export function SettingsIcon({ size = 24, strokeWidth = 1.8, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V19a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.4 17.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 13a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 6.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V1a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V7a1.7 1.7 0 0 0 1.56 1H23a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
    </svg>
  )
}
