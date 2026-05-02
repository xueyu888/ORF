import { useId, type ReactNode, type SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function useIconId(prefix: string) {
  return `${prefix}-${useId().replace(/:/g, '')}`;
}

function IconShell({ size = 28, children, className, ...rest }: IconProps & { children: ReactNode }) {
  const classes = ['ft-ornate-icon', className ?? ''].filter(Boolean).join(' ');
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

function SharedDefs({ uid, accent = '#67D8FF', accentDark = '#1E65D7' }: { uid: string; accent?: string; accentDark?: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFF7D8" />
        <stop offset="30%" stopColor="#F4D37A" />
        <stop offset="64%" stopColor="#C88B2F" />
        <stop offset="100%" stopColor="#7D4A16" />
      </linearGradient>
      <linearGradient id={`${uid}-gold2`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFF9E5" />
        <stop offset="45%" stopColor="#E3B653" />
        <stop offset="100%" stopColor="#784514" />
      </linearGradient>
      <linearGradient id={`${uid}-gem`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="22%" stopColor={accent} />
        <stop offset="100%" stopColor={accentDark} />
      </linearGradient>
      <linearGradient id={`${uid}-ivory`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFFDF6" />
        <stop offset="100%" stopColor="#EEDDB9" />
      </linearGradient>
      <radialGradient id={`${uid}-glow`} cx="50%" cy="42%" r="58%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.72)" />
        <stop offset="100%" stopColor="rgba(255,255,255,0)" />
      </radialGradient>
      <filter id={`${uid}-shadow`} x="-35%" y="-35%" width="170%" height="170%">
        <feDropShadow dx="0" dy="1.7" stdDeviation="1.3" floodColor="rgba(24, 12, 4, 0.42)" />
      </filter>
    </defs>
  );
}

export function OrnateCompassIcon(props: IconProps) {
  const uid = useIconId('ornate-compass');
  return (
    <IconShell {...props}>
      <SharedDefs uid={uid} accent="#79E4FF" accentDark="#206ADF" />
      <g filter={`url(#${uid}-shadow)`}>
        <circle cx="32" cy="32" r="25" fill={`url(#${uid}-gold)`} />
        <circle cx="32" cy="32" r="20.5" fill="#163B70" stroke="#FFF0B7" strokeWidth="1.2" />
        <circle cx="32" cy="32" r="17" fill={`url(#${uid}-glow)`} opacity="0.38" />
        <path d="M32 5.5L36.4 25.6L56.5 32L36.4 38.4L32 58.5L27.6 38.4L7.5 32L27.6 25.6L32 5.5Z" fill={`url(#${uid}-gold2)`} />
        <path d="M32 12L35.4 28.6L51 32L35.4 35.4L32 48L28.6 35.4L13 32L28.6 28.6L32 12Z" fill={`url(#${uid}-gem)`} />
        <path d="M32 17L34 30L45 32L34 34L32 45L30 34L19 32L30 30L32 17Z" fill="#E9FBFF" opacity="0.55" />
        <circle cx="32" cy="32" r="5.2" fill={`url(#${uid}-gold)`} />
        <circle cx="32" cy="32" r="2.8" fill="#F7FBFF" />
        <path d="M17 20C22 15.5 27 13 32 13M45 20C40 15.5 36 13.3 32 13" stroke="#FFE9A5" strokeWidth="1.2" strokeLinecap="round" opacity="0.65" />
        <path d="M18 45C22 49.4 27 51 32 51M46 45C41 49.4 36 51 32 51" stroke="#FFE9A5" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      </g>
    </IconShell>
  );
}

export function OrnateFilterIcon(props: IconProps) {
  const uid = useIconId('ornate-filter');
  return (
    <IconShell {...props}>
      <SharedDefs uid={uid} accent="#8EE1FF" accentDark="#4C82D9" />
      <g filter={`url(#${uid}-shadow)`}>
        <path d="M9 12H55L39.5 31.8V47.5L26 54V31.8L9 12Z" fill={`url(#${uid}-gold)`} />
        <path d="M15.5 17.5H48.5L36.2 31V43.2L30 46.2V31L15.5 17.5Z" fill={`url(#${uid}-ivory)`} />
        <path d="M20 21H44L34.7 31H29.7L20 21Z" fill={`url(#${uid}-gem)`} opacity="0.95" />
        <path d="M14 15.5C20 10.5 26 9 32 9C38 9 44 10.5 50 15.5" stroke="#FFF0B7" strokeWidth="2" strokeLinecap="round" />
        <path d="M21 49C17 43 16 37 17.5 31M43 49C47 43 48 37 46.5 31" stroke="#D8A040" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
        <path d="M26.8 36C29.8 38 33.2 38 36.2 36" stroke="#9D6C25" strokeWidth="1.3" strokeLinecap="round" opacity="0.55" />
        <circle cx="32" cy="16.5" r="2.2" fill={`url(#${uid}-gem)`} />
      </g>
    </IconShell>
  );
}

export function OrnateCheckIcon(props: IconProps) {
  const uid = useIconId('ornate-check');
  return (
    <IconShell {...props}>
      <SharedDefs uid={uid} accent="#B7FFF2" accentDark="#269D94" />
      <g filter={`url(#${uid}-shadow)`}>
        <circle cx="32" cy="32" r="25" fill={`url(#${uid}-gold)`} />
        <circle cx="32" cy="32" r="20.5" fill="#1C736E" stroke="#FFF0B7" strokeWidth="1.2" />
        <path d="M17 33C17 25 22 18 32 16C42 18 47 25 47 33C47 42 40 49 32 51C24 49 17 42 17 33Z" fill={`url(#${uid}-gem)`} opacity="0.32" />
        <path d="M20 31.5L28.5 40L45.2 23.7" stroke="#FFF7D8" strokeWidth="5.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 31.5L28.5 40L45.2 23.7" stroke="#64E6D4" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 35C18 43 24 48 32 50M50 35C46 43 40 48 32 50" stroke="#E4C66E" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
        <path d="M18 21C22 17 26 15 32 14M46 21C42 17 38 15 32 14" stroke="#FFF1B7" strokeWidth="1.4" strokeLinecap="round" opacity="0.75" />
      </g>
    </IconShell>
  );
}

export function OrnateTrashIcon(props: IconProps) {
  const uid = useIconId('ornate-trash');
  return (
    <IconShell {...props}>
      <SharedDefs uid={uid} accent="#FFD480" accentDark="#D58219" />
      <g filter={`url(#${uid}-shadow)`}>
        <path d="M20 17H44L41.5 51C41.2 54.5 38.5 57 35 57H29C25.5 57 22.8 54.5 22.5 51L20 17Z" fill={`url(#${uid}-gold)`} />
        <path d="M24.5 22H39.5L37.6 49.5C37.5 51 36.2 52.2 34.7 52.2H29.3C27.8 52.2 26.5 51 26.4 49.5L24.5 22Z" fill="#8F2C2A" />
        <path d="M18 17H46L43.4 11.5H36.5L34.8 8.5H29.2L27.5 11.5H20.6L18 17Z" fill={`url(#${uid}-gold2)`} />
        <path d="M15 19.3H49" stroke="#FFF0B7" strokeWidth="3" strokeLinecap="round" />
        <path d="M28.5 27V47M34.5 27V47" stroke="#FFD58A" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
        <path d="M30 17.3L32 13L34 17.3L32 21Z" fill={`url(#${uid}-gem)`} />
        <path d="M20 34C16 30 15 25 16 21M44 34C48 30 49 25 48 21" stroke="#D99D34" strokeWidth="2" strokeLinecap="round" opacity="0.72" />
        <path d="M27 52C29.8 54 34.2 54 37 52" stroke="#FFDDA0" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      </g>
    </IconShell>
  );
}

export function OrnateSaveIcon(props: IconProps) {
  const uid = useIconId('ornate-save');
  return (
    <IconShell {...props}>
      <SharedDefs uid={uid} accent="#FFF2B6" accentDark="#C98F24" />
      <g filter={`url(#${uid}-shadow)`}>
        <path d="M15 9H43L53 19V53C53 56 50.8 58 47.8 58H16.2C13.2 58 11 56 11 53V14C11 11 12.2 9 15 9Z" fill={`url(#${uid}-gold)`} />
        <path d="M18 14H39.5L47.5 22V52H16.5V14.5C16.5 14.2 16.8 14 18 14Z" fill="#214C83" />
        <rect x="21" y="14" width="19" height="13" rx="2" fill={`url(#${uid}-ivory)`} />
        <rect x="22" y="36" width="20" height="16" rx="2.5" fill={`url(#${uid}-ivory)`} />
        <path d="M29 18H36V26H29V18Z" fill={`url(#${uid}-gem)`} />
        <path d="M32 28L34.5 34.5L41 37L34.5 39.5L32 46L29.5 39.5L23 37L29.5 34.5L32 28Z" fill={`url(#${uid}-gold2)`} />
        <path d="M32 32L33.5 36L37.5 37.5L33.5 39L32 43L30.5 39L26.5 37.5L30.5 36Z" fill="#FFFFFF" opacity="0.8" />
        <path d="M13 24C17 30 18 36 16 43M51 24C47 30 46 36 48 43" stroke="#FFF0B7" strokeWidth="1.8" strokeLinecap="round" opacity="0.65" />
      </g>
    </IconShell>
  );
}

export function OrnateCloseIcon(props: IconProps) {
  const uid = useIconId('ornate-close');
  return (
    <IconShell {...props}>
      <SharedDefs uid={uid} accent="#FFD37D" accentDark="#D07C1B" />
      <g filter={`url(#${uid}-shadow)`}>
        <circle cx="32" cy="32" r="24" fill={`url(#${uid}-gold)`} />
        <circle cx="32" cy="32" r="19" fill="#8A2D2B" stroke="#FFF0B7" strokeWidth="1.2" />
        <path d="M19 17L46.5 44.5" stroke="#FFF5D0" strokeWidth="8" strokeLinecap="round" />
        <path d="M46.5 17L19 44.5" stroke="#FFF5D0" strokeWidth="8" strokeLinecap="round" />
        <path d="M19 17L46.5 44.5" stroke={`url(#${uid}-gold2)`} strokeWidth="4" strokeLinecap="round" />
        <path d="M46.5 17L19 44.5" stroke={`url(#${uid}-gold2)`} strokeWidth="4" strokeLinecap="round" />
        <circle cx="32" cy="32" r="5" fill={`url(#${uid}-gem)`} />
        <path d="M15 31C17 23 23 16 32 14M49 31C47 23 41 16 32 14" stroke="#FFDFA0" strokeWidth="1.5" strokeLinecap="round" opacity="0.56" />
      </g>
    </IconShell>
  );
}

export function OrnateChevronRightIcon(props: IconProps) {
  const uid = useIconId('ornate-chevron');
  return (
    <IconShell {...props}>
      <SharedDefs uid={uid} accent="#79E4FF" accentDark="#206ADF" />
      <g filter={`url(#${uid}-shadow)`}>
        <path d="M17 8L48 32L17 56L25.5 32L17 8Z" fill={`url(#${uid}-gold)`} />
        <path d="M23.5 19L40.5 32L23.5 45L29 32L23.5 19Z" fill={`url(#${uid}-gem)`} />
        <path d="M26 24L36.5 32L26 40" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
        <path d="M14 20C19 16 24 14 30 13M14 44C19 48 24 50 30 51" stroke="#FFE9A8" strokeWidth="1.5" strokeLinecap="round" opacity="0.62" />
      </g>
    </IconShell>
  );
}

export function OrnateCalendarIcon(props: IconProps) {
  const uid = useIconId('ornate-calendar');
  return (
    <IconShell {...props}>
      <SharedDefs uid={uid} accent="#A8E8FF" accentDark="#416FD6" />
      <g filter={`url(#${uid}-shadow)`}>
        <rect x="11" y="13" width="42" height="46" rx="8" fill={`url(#${uid}-gold)`} />
        <rect x="16" y="22" width="32" height="32" rx="5" fill={`url(#${uid}-ivory)`} />
        <path d="M17 22H47V31H17V22Z" fill="#255D9F" />
        <path d="M22 8V18M42 8V18" stroke="#FFF2BC" strokeWidth="4" strokeLinecap="round" />
        <circle cx="32" cy="39" r="8" fill={`url(#${uid}-gem)`} opacity="0.95" />
        <path d="M32 33V39L36 43" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        <path d="M20 48H44" stroke="#C4943C" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      </g>
    </IconShell>
  );
}
