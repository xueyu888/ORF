import { useId, type ReactNode, type SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
type Tone = 'blue' | 'gold' | 'red' | 'green' | 'ivory';

function BaseIcon({ size = 64, children, className, ...rest }: IconProps & { children: ReactNode }) {
  const classes = ['ft-rich-icon', 'ft-ornate-icon', className ?? ''].filter(Boolean).join(' ');
  return (
    <svg
      className={classes}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

function toneStops(tone: Tone) {
  switch (tone) {
    case 'red':
      return ['#FFE2B2', '#D84B3D', '#6B1E1B'];
    case 'green':
      return ['#E7FFF8', '#46C5B8', '#17605A'];
    case 'ivory':
      return ['#FFFFFF', '#F6E7C8', '#CFA260'];
    case 'gold':
      return ['#FFF7D0', '#F0BE53', '#8B5A1F'];
    case 'blue':
    default:
      return ['#E8FFFF', '#4FB9FF', '#163E8E'];
  }
}

function Defs({ id, tone = 'blue' }: { id: string; tone?: Tone }) {
  const [a, b, c] = toneStops(tone);
  return (
    <defs>
      <linearGradient id={`${id}-gold`} x1="14" y1="4" x2="50" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#FFF9D8" />
        <stop offset="0.3" stopColor="#F1C766" />
        <stop offset="0.58" stopColor="#C98B2D" />
        <stop offset="1" stopColor="#674116" />
      </linearGradient>
      <linearGradient id={`${id}-goldDark`} x1="22" y1="8" x2="42" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#FFEFB3" />
        <stop offset="1" stopColor="#7C4B18" />
      </linearGradient>
      <linearGradient id={`${id}-tone`} x1="16" y1="8" x2="48" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor={a} />
        <stop offset="0.48" stopColor={b} />
        <stop offset="1" stopColor={c} />
      </linearGradient>
      <radialGradient id={`${id}-shine`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(22 14) rotate(50) scale(42 35)">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
        <stop offset="0.32" stopColor="#FFFFFF" stopOpacity="0.22" />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${id}-gem`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(28 21) rotate(58) scale(18)">
        <stop offset="0" stopColor="#FFFFFF" />
        <stop offset="0.28" stopColor={a} />
        <stop offset="1" stopColor={c} />
      </radialGradient>
      <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
        <feDropShadow dx="0" dy="2.2" stdDeviation="1.7" floodColor="#2B1607" floodOpacity="0.38" />
        <feDropShadow dx="0" dy="0.6" stdDeviation="0.5" floodColor="#FFFFFF" floodOpacity="0.25" />
      </filter>
      <filter id={`${id}-innerShadow`} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
        <feDropShadow dx="0" dy="1" stdDeviation="0.65" floodColor="#2A1304" floodOpacity="0.35" />
      </filter>
      <filter id={`${id}-grain`} x="0" y="0" width="64" height="64" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.92" numOctaves="3" seed="9" result="noise" />
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 0.86  0 0 0 0 0.55  0 0 0 .16 0" result="grain" />
      </filter>
      <radialGradient id={`${id}-rimShade`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(42 46) rotate(-145) scale(38 34)">
        <stop offset="0" stopColor="#1B0C04" stopOpacity="0.34" />
        <stop offset="0.48" stopColor="#1B0C04" stopOpacity="0.08" />
        <stop offset="1" stopColor="#1B0C04" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

function Medallion({ id, tone, children }: { id: string; tone: Tone; children: ReactNode }) {
  return (
    <g filter={`url(#${id}-shadow)`}>
      <circle cx="32" cy="32" r="28.2" fill="#3A210B" opacity="0.28" transform="translate(0 1.8)" />
      <circle cx="32" cy="32" r="27.5" fill={`url(#${id}-gold)`} />
      <circle cx="32" cy="32" r="25.2" fill="#FFF6CF" opacity="0.38" />
      <circle cx="32" cy="32" r="23.5" fill={`url(#${id}-tone)`} />
      <circle cx="32" cy="32" r="23.5" fill={`url(#${id}-rimShade)`} />
      <circle cx="32" cy="32" r="21.5" fill="rgba(255,255,255,0.08)" filter={`url(#${id}-grain)`} />
      <circle cx="32" cy="32" r="20" fill="rgba(8,22,48,0.18)" />
      <circle cx="32" cy="32" r="20" fill={`url(#${id}-shine)`} />
      <path d="M32 4.5 L35.8 10.5 L32 14.1 L28.2 10.5 Z" fill={`url(#${id}-gold)`} />
      <path d="M32 49.9 L35.8 53.5 L32 59.5 L28.2 53.5 Z" fill={`url(#${id}-goldDark)`} />
      <path d="M4.5 32 L10.5 28.2 L14.1 32 L10.5 35.8 Z" fill={`url(#${id}-goldDark)`} />
      <path d="M49.9 32 L53.5 28.2 L59.5 32 L53.5 35.8 Z" fill={`url(#${id}-goldDark)`} />
      <circle cx="32" cy="32" r="24.5" stroke="#FFF4C7" strokeWidth="1.1" opacity="0.78" />
      <circle cx="32" cy="32" r="17.2" stroke="#FFF0B7" strokeWidth="0.75" opacity="0.38" />
      <g opacity="0.58" fill="#FFEFC4">
        <path d="M17.2 21.7 C20.8 18.1 24.2 16.6 28.3 16.1 C24.6 18.3 22 20.7 20.2 24.4 C19.4 23.2 18.4 22.4 17.2 21.7 Z" />
        <path d="M46.8 42.3 C43.2 45.9 39.8 47.4 35.7 47.9 C39.4 45.7 42 43.3 43.8 39.6 C44.6 40.8 45.6 41.6 46.8 42.3 Z" />
        <path d="M21.7 46.8 C18.1 43.2 16.6 39.8 16.1 35.7 C18.3 39.4 20.7 42 24.4 43.8 C23.2 44.6 22.4 45.6 21.7 46.8 Z" />
        <path d="M42.3 17.2 C45.9 20.8 47.4 24.2 47.9 28.3 C45.7 24.6 43.3 22 39.6 20.2 C40.8 19.4 41.6 18.4 42.3 17.2 Z" />
      </g>
      <g opacity="0.72" fill={`url(#${id}-gem)`} stroke="#FFF0B6" strokeWidth="0.65">
        <circle cx="32" cy="9.8" r="1.35" />
        <circle cx="32" cy="54.2" r="1.35" />
        <circle cx="9.8" cy="32" r="1.35" />
        <circle cx="54.2" cy="32" r="1.35" />
      </g>
      {children}
    </g>
  );
}

export function CompassIcon(props: IconProps) {
  const id = `compass-${useId().replace(/:/g, '')}`;
  return (
    <BaseIcon {...props}>
      <Defs id={id} tone="blue" />
      <Medallion id={id} tone="blue">
        <g filter={`url(#${id}-innerShadow)`}>
          <path d="M32 11.5 L38.7 27.2 L55 32 L38.7 36.8 L32 52.5 L25.3 36.8 L9 32 L25.3 27.2 Z" fill={`url(#${id}-gold)`} />
          <path d="M32 17.5 L35.4 29.2 L47.5 32 L35.4 34.8 L32 46.5 L28.6 34.8 L16.5 32 L28.6 29.2 Z" fill={`url(#${id}-tone)`} />
          <path d="M32 21.5 L35.1 31.9 L32 42.5 L28.9 31.9 Z" fill="#FFF2C0" opacity="0.92" />
          <circle cx="32" cy="32" r="7.8" fill={`url(#${id}-goldDark)`} />
          <circle cx="32" cy="32" r="5.1" fill={`url(#${id}-gem)`} />
          <path d="M32 27.7 L34.8 32 L32 36.3 L29.2 32 Z" fill="#FFFFFF" opacity="0.75" />
          <g fill="#FFF2C0" opacity="0.85">
            <circle cx="21.4" cy="21.4" r="1.1" />
            <circle cx="42.6" cy="21.4" r="1.1" />
            <circle cx="21.4" cy="42.6" r="1.1" />
            <circle cx="42.6" cy="42.6" r="1.1" />
          </g>
        </g>
      </Medallion>
    </BaseIcon>
  );
}

export function TrashIcon(props: IconProps) {
  const id = `trash-${useId().replace(/:/g, '')}`;
  return (
    <BaseIcon {...props}>
      <Defs id={id} tone="red" />
      <Medallion id={id} tone="red">
        <g filter={`url(#${id}-innerShadow)`}>
          <path d="M19.5 24.5 H44.5 L42.2 47.2 C42 49.6 39.8 51.4 37.4 51.4 H26.6 C24.2 51.4 22 49.6 21.8 47.2 Z" fill={`url(#${id}-gold)`} />
          <path d="M23.3 28.4 H40.7 L39 46.1 C38.9 47.4 37.8 48.3 36.5 48.3 H27.5 C26.2 48.3 25.1 47.4 25 46.1 Z" fill={`url(#${id}-tone)`} />
          <path d="M21 19.3 H43 L45.8 24.8 H18.2 Z" fill={`url(#${id}-goldDark)`} />
          <path d="M26.2 15.5 H37.8 L40.5 19.4 H23.5 Z" fill={`url(#${id}-gold)`} />
          <path d="M29.5 31 V44.8" stroke="#FFEFC4" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
          <path d="M34.5 31 V44.8" stroke="#FFEFC4" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
          <path d="M24.4 28.4 C29.5 31.2 34.5 31.2 39.6 28.4" stroke="#FFF6D6" strokeWidth="1.25" opacity="0.55" />
          <path d="M18.5 17.3 C20 15.8 22.1 15.1 24.8 15.3" stroke="#FFE2A2" strokeWidth="1.1" strokeLinecap="round" opacity="0.72" />
          <path d="M45.5 17.3 C44 15.8 41.9 15.1 39.2 15.3" stroke="#FFE2A2" strokeWidth="1.1" strokeLinecap="round" opacity="0.72" />
        </g>
      </Medallion>
    </BaseIcon>
  );
}

export function CheckCircleIcon(props: IconProps) {
  const id = `check-${useId().replace(/:/g, '')}`;
  return (
    <BaseIcon {...props}>
      <Defs id={id} tone="green" />
      <Medallion id={id} tone="green">
        <g filter={`url(#${id}-innerShadow)`}>
          <path d="M16.5 32.6 C19.8 39.7 25.7 45.3 32 49 C38.3 45.3 44.2 39.7 47.5 32.6 C46.8 23.7 41.1 18 32 14.4 C22.9 18 17.2 23.7 16.5 32.6 Z" fill={`url(#${id}-gold)`} />
          <path d="M20.9 32.6 C23.2 37.7 27.3 41.8 32 44.7 C36.7 41.8 40.8 37.7 43.1 32.6 C42.5 26.1 38.3 22.1 32 19.5 C25.7 22.1 21.5 26.1 20.9 32.6 Z" fill={`url(#${id}-tone)`} />
          <path d="M24.3 32.8 L29.5 37.8 L41.3 25.6 L44.2 29.4 L30.2 43.2 L21.1 35.7 Z" fill="#FFF3C8" />
          <path d="M24.3 32.8 L29.5 37.8 L41.3 25.6" stroke="#FFFFFF" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" opacity="0.48" />
          <g fill="#EFFFF8" opacity="0.55">
            <circle cx="24.2" cy="24.8" r="1" />
            <circle cx="39.8" cy="24.8" r="1" />
            <circle cx="32" cy="18.4" r="0.9" />
          </g>
        </g>
      </Medallion>
    </BaseIcon>
  );
}

export function FilterIcon(props: IconProps) {
  const id = `filter-${useId().replace(/:/g, '')}`;
  return (
    <BaseIcon {...props}>
      <Defs id={id} tone="ivory" />
      <Medallion id={id} tone="ivory">
        <g filter={`url(#${id}-innerShadow)`}>
          <path d="M16.5 17.2 H47.5 L37.6 31.2 V45.3 L29 50 V31.2 Z" fill={`url(#${id}-gold)`} />
          <path d="M21.5 21.3 H42.5 L34.3 32.2 V42.3 L31.2 44.1 V32.2 Z" fill={`url(#${id}-tone)`} />
          <path d="M24.2 24.2 H39.8" stroke="#9F6F2A" strokeWidth="1.4" strokeLinecap="round" opacity="0.58" />
          <path d="M29.7 32.3 H34.3" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
          <path d="M32 26.8 L35.1 30 L32 33.2 L28.9 30 Z" fill={`url(#${id}-gem)`} stroke="#D8A64E" strokeWidth="1" />
          <path d="M18.8 16.2 C21.2 13.8 25.2 13.2 29.1 14.1" stroke="#FFF0C1" strokeWidth="1.15" strokeLinecap="round" opacity="0.75" />
          <path d="M45.2 16.2 C42.8 13.8 38.8 13.2 34.9 14.1" stroke="#FFF0C1" strokeWidth="1.15" strokeLinecap="round" opacity="0.75" />
        </g>
      </Medallion>
    </BaseIcon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  const id = `chevron-${useId().replace(/:/g, '')}`;
  return (
    <BaseIcon {...props}>
      <Defs id={id} tone="blue" />
      <Medallion id={id} tone="blue">
        <g filter={`url(#${id}-innerShadow)`}>
          <path d="M23.5 13 L46.5 32 L23.5 51 L18.8 44 L33.6 32 L18.8 20 Z" fill={`url(#${id}-gold)`} />
          <path d="M27 21.3 L40.1 32 L27 42.7 L24.2 38.4 L34 32 L24.2 25.6 Z" fill="#FFF4C2" />
          <path d="M21 16.8 C26.2 19.1 30.3 22.1 34.4 26.1" stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round" opacity="0.35" />
          <path d="M21 47.2 C26.2 44.9 30.3 41.9 34.4 37.9" stroke="#704816" strokeWidth="1" strokeLinecap="round" opacity="0.38" />
          <circle cx="21.5" cy="32" r="2.2" fill={`url(#${id}-gem)`} stroke="#FFE8A2" strokeWidth="0.9" />
        </g>
      </Medallion>
    </BaseIcon>
  );
}

export function CloseIcon(props: IconProps) {
  const id = `close-${useId().replace(/:/g, '')}`;
  return (
    <BaseIcon {...props}>
      <Defs id={id} tone="red" />
      <Medallion id={id} tone="red">
        <g filter={`url(#${id}-innerShadow)`}>
          <path d="M20.4 15.8 L32 26.2 L43.6 15.8 L48.2 20.4 L37.8 32 L48.2 43.6 L43.6 48.2 L32 37.8 L20.4 48.2 L15.8 43.6 L26.2 32 L15.8 20.4 Z" fill={`url(#${id}-gold)`} />
          <path d="M23.5 20.5 L32 28.1 L40.5 20.5 L43.5 23.5 L35.9 32 L43.5 40.5 L40.5 43.5 L32 35.9 L23.5 43.5 L20.5 40.5 L28.1 32 L20.5 23.5 Z" fill="#FFF1BD" />
          <path d="M32 25.3 L36.7 32 L32 38.7 L27.3 32 Z" fill={`url(#${id}-gem)`} stroke="#C58C2D" strokeWidth="0.9" />
          <g opacity="0.55" stroke="#FFF0C5" strokeWidth="1" strokeLinecap="round">
            <path d="M17.8 26.5 C20.3 24.2 22.8 22.1 25.7 20" />
            <path d="M46.2 37.5 C43.7 39.8 41.2 41.9 38.3 44" />
          </g>
        </g>
      </Medallion>
    </BaseIcon>
  );
}

export function SaveSparkIcon(props: IconProps) {
  const id = `spark-${useId().replace(/:/g, '')}`;
  return (
    <BaseIcon {...props}>
      <Defs id={id} tone="gold" />
      <Medallion id={id} tone="gold">
        <g filter={`url(#${id}-innerShadow)`}>
          <path d="M32 9.5 L38.4 24.8 L54 32 L38.4 39.2 L32 54.5 L25.6 39.2 L10 32 L25.6 24.8 Z" fill={`url(#${id}-gold)`} />
          <path d="M32 17.1 L35.7 27.7 L46.5 32 L35.7 36.3 L32 46.9 L28.3 36.3 L17.5 32 L28.3 27.7 Z" fill="#FFF6C9" />
          <path d="M32 22.8 L34.6 32 L32 41.2 L29.4 32 Z" fill={`url(#${id}-gem)`} />
          <path d="M21.4 12.2 L23.4 17.2 L28.4 19.2 L23.4 21.2 L21.4 26.2 L19.4 21.2 L14.4 19.2 L19.4 17.2 Z" fill="#FFF3BD" opacity="0.85" />
          <path d="M46.5 44 L48 47.5 L51.5 49 L48 50.5 L46.5 54 L45 50.5 L41.5 49 L45 47.5 Z" fill="#FFF3BD" opacity="0.7" />
        </g>
      </Medallion>
    </BaseIcon>
  );
}

export function PlusGemIcon(props: IconProps) {
  const id = `plus-gem-${useId().replace(/:/g, '')}`;
  return (
    <BaseIcon {...props}>
      <Defs id={id} tone="blue" />
      <Medallion id={id} tone="blue">
        <g filter={`url(#${id}-innerShadow)`}>
          <path d="M29.2 13.8 H35.8 L37.1 25.2 L48.4 26.1 V34.2 L37.1 35.1 L35.8 48.2 H29.2 L27.9 35.1 L16.6 34.2 V26.1 L27.9 25.2 Z" fill={`url(#${id}-gold)`} />
          <path d="M31.1 18.5 H33.9 L35 27.9 L44.6 28.8 V31.9 L35 32.8 L33.9 44.5 H31.1 L30 32.8 L20.4 31.9 V28.8 L30 27.9 Z" fill="#FFF2C3" />
          <path d="M32 22.4 L37.8 32 L32 41.6 L26.2 32 Z" fill={`url(#${id}-gem)`} stroke="#FFE7A3" strokeWidth="1.1" />
          <circle cx="32" cy="32" r="3.8" fill="#FFFFFF" opacity="0.62" />
          <g opacity="0.65" stroke="#FFF3BF" strokeWidth="1.1" strokeLinecap="round">
            <path d="M16.2 23.4 C20.4 18.2 25.4 15.4 32 15.2" />
            <path d="M47.8 40.6 C43.6 45.8 38.6 48.6 32 48.8" />
          </g>
          <g fill="#FFF2C0" opacity="0.82">
            <circle cx="19" cy="19" r="1.1" />
            <circle cx="45" cy="19" r="1.1" />
            <circle cx="19" cy="45" r="1.1" />
            <circle cx="45" cy="45" r="1.1" />
          </g>
        </g>
      </Medallion>
    </BaseIcon>
  );
}

export function MoreGemIcon(props: IconProps) {
  const id = `more-gem-${useId().replace(/:/g, '')}`;
  return (
    <BaseIcon {...props}>
      <Defs id={id} tone="ivory" />
      <Medallion id={id} tone="ivory">
        <g filter={`url(#${id}-innerShadow)`}>
          <path d="M16.5 32 C19.6 23.8 25.5 19 32 19 C38.5 19 44.4 23.8 47.5 32 C44.4 40.2 38.5 45 32 45 C25.5 45 19.6 40.2 16.5 32 Z" fill={`url(#${id}-gold)`} opacity="0.96" />
          <path d="M20.5 32 C23.1 26.4 27.2 23.4 32 23.4 C36.8 23.4 40.9 26.4 43.5 32 C40.9 37.6 36.8 40.6 32 40.6 C27.2 40.6 23.1 37.6 20.5 32 Z" fill={`url(#${id}-tone)`} />
          {[24.5, 32, 39.5].map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy="32" r="4.2" fill={`url(#${id}-gold)`} stroke="#7A4A16" strokeWidth="0.9" />
              <circle cx={cx - 1.2} cy="30.6" r="1" fill="#FFFFFF" opacity="0.82" />
            </g>
          ))}
          <path d="M21 24.8 C27.8 20.8 36.2 20.8 43 24.8" stroke="#FFF5CA" strokeWidth="1.25" strokeLinecap="round" opacity="0.62" />
          <path d="M21 39.2 C27.8 43.2 36.2 43.2 43 39.2" stroke="#8A5A1D" strokeWidth="1.15" strokeLinecap="round" opacity="0.38" />
          <g opacity="0.6" stroke="#FFF2BF" strokeWidth="1" strokeLinecap="round">
            <path d="M14.8 26.8 C17.4 22.1 21.1 18.6 26.6 16.2" />
            <path d="M49.2 37.2 C46.6 41.9 42.9 45.4 37.4 47.8" />
          </g>
        </g>
      </Medallion>
    </BaseIcon>
  );
}
