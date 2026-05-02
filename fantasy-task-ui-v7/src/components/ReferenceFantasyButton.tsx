import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';

export interface ReferenceFantasyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  block?: boolean;
}

function ReferenceButtonArt({ disabled = false }: { disabled?: boolean }) {
  const rawId = useId().replace(/:/g, '');
  const ids = {
    gold: `ref-gold-${rawId}`,
    goldDark: `ref-gold-dark-${rawId}`,
    blue: `ref-blue-${rawId}`,
    blueInner: `ref-blue-inner-${rawId}`,
    gem: `ref-gem-${rawId}`,
    gemDark: `ref-gem-dark-${rawId}`,
    gloss: `ref-gloss-${rawId}`,
    edge: `ref-edge-${rawId}`,
    shadow: `ref-shadow-${rawId}`,
    noise: `ref-noise-${rawId}`,
    clip: `ref-clip-${rawId}`,
    watermark: `ref-watermark-${rawId}`,
  };

  const opacity = disabled ? 0.56 : 1;

  return (
    <svg
      className="ft-reference-button__art"
      viewBox="0 0 1200 230"
      preserveAspectRatio="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={ids.gold} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF8D8" />
          <stop offset="0.18" stopColor="#F1D08A" />
          <stop offset="0.48" stopColor="#C58A2E" />
          <stop offset="0.72" stopColor="#F2CD74" />
          <stop offset="1" stopColor="#6D4217" />
        </linearGradient>
        <linearGradient id={ids.goldDark} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFF6D4" />
          <stop offset="0.36" stopColor="#D7A249" />
          <stop offset="0.72" stopColor="#8F5A20" />
          <stop offset="1" stopColor="#472A0D" />
        </linearGradient>
        <linearGradient id={ids.blue} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3C78C0" />
          <stop offset="0.38" stopColor="#255E9E" />
          <stop offset="0.72" stopColor="#123A67" />
          <stop offset="1" stopColor="#092447" />
        </linearGradient>
        <linearGradient id={ids.blueInner} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#568BCC" />
          <stop offset="0.4" stopColor="#1D5994" />
          <stop offset="1" stopColor="#0A2D56" />
        </linearGradient>
        <linearGradient id={ids.gem} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EEFFFF" />
          <stop offset="0.22" stopColor="#5CD8FF" />
          <stop offset="0.58" stopColor="#1F75E6" />
          <stop offset="1" stopColor="#073A89" />
        </linearGradient>
        <linearGradient id={ids.gemDark} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2AA5FF" />
          <stop offset="1" stopColor="#072A68" />
        </linearGradient>
        <linearGradient id={ids.gloss} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,.82)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <linearGradient id={ids.edge} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,.7)" />
          <stop offset="0.62" stopColor="rgba(0,0,0,.04)" />
          <stop offset="1" stopColor="rgba(0,0,0,.42)" />
        </linearGradient>
        <radialGradient id={ids.watermark} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="rgba(160,198,234,.34)" />
          <stop offset="1" stopColor="rgba(160,198,234,0)" />
        </radialGradient>
        <filter id={ids.shadow} x="-8%" y="-18%" width="116%" height="150%">
          <feDropShadow dx="0" dy="7" stdDeviation="6" floodColor="rgba(28,17,6,.34)" />
          <feDropShadow dx="0" dy="16" stdDeviation="8" floodColor="rgba(14,8,3,.16)" />
        </filter>
        <filter id={ids.noise} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" seed="7" result="noise" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.70 0 0 0 0 0.82 0 0 0 0 1 0 0 0 .18 0"
          />
        </filter>
        <clipPath id={ids.clip}>
          <path d="M142 39H1058C1089 39 1112 57 1121 86C1126 101 1131 107 1139 115C1131 123 1126 131 1121 145C1112 174 1089 192 1058 192H142C111 192 88 174 79 145C74 131 69 123 61 115C69 107 74 101 79 86C88 57 111 39 142 39Z" />
        </clipPath>
      </defs>

      <g opacity={opacity} filter={`url(#${ids.shadow})`}>
        {/* Main gold outer frame */}
        <path
          d="M122 18H1078C1118 18 1145 43 1155 81C1161 83 1175 95 1189 115C1175 135 1161 147 1155 149C1145 187 1118 212 1078 212H122C82 212 55 187 45 149C39 147 25 135 11 115C25 95 39 83 45 81C55 43 82 18 122 18Z"
          fill={`url(#${ids.gold})`}
        />
        <path
          d="M129 26H1071C1108 26 1132 48 1141 84C1147 91 1154 100 1164 115C1154 130 1147 139 1141 146C1132 182 1108 204 1071 204H129C92 204 68 182 59 146C53 139 46 130 36 115C46 100 53 91 59 84C68 48 92 26 129 26Z"
          fill="rgba(22,17,12,.36)"
        />
        <path
          d="M137 34H1063C1096 34 1119 54 1128 89C1134 96 1140 105 1148 115C1140 125 1134 134 1128 141C1119 176 1096 196 1063 196H137C104 196 81 176 72 141C66 134 60 125 52 115C60 105 66 96 72 89C81 54 104 34 137 34Z"
          fill={`url(#${ids.blue})`}
        />
        <path
          d="M153 49H1047C1073 49 1091 64 1097 90C1101 104 1106 110 1111 115C1106 120 1101 126 1097 140C1091 166 1073 181 1047 181H153C127 181 109 166 103 140C99 126 94 120 89 115C94 110 99 104 103 90C109 64 127 49 153 49Z"
          fill={`url(#${ids.blueInner})`}
        />
        <path
          d="M158 55H1042C1067 55 1082 68 1088 91C1091 104 1095 111 1099 115C1095 119 1091 126 1088 139C1082 162 1067 175 1042 175H158C133 175 118 162 112 139C109 126 105 119 101 115C105 111 109 104 112 91C118 68 133 55 158 55Z"
          fill="none"
          stroke="rgba(255,245,210,.72)"
          strokeWidth="2"
        />

        {/* clipped texture + subtle gloss */}
        <g clipPath={`url(#${ids.clip})`}>
          <rect x="60" y="38" width="1080" height="154" filter={`url(#${ids.noise})`} opacity="0.45" />
          <ellipse cx="600" cy="88" rx="395" ry="86" fill={`url(#${ids.watermark})`} opacity="0.54" />
          <path d="M150 47C310 70 890 70 1050 47V74C880 94 320 94 150 74Z" fill={`url(#${ids.gloss})`} opacity="0.26" />
          <path d="M150 142C310 160 890 160 1050 142V181H150Z" fill="rgba(0,0,0,.18)" opacity="0.28" />
          <g opacity="0.16" stroke="#A7C7E9" fill="none" strokeWidth="3">
            <circle cx="600" cy="115" r="68" />
            <path d="M600 38V192M523 115H677" />
            <path d="M600 50L624 115L600 180L576 115Z" />
            <path d="M530 115L600 90L670 115L600 140Z" />
          </g>
        </g>

        {/* inner gold lines */}
        <path d="M148 44H1052" stroke={`url(#${ids.gold})`} strokeWidth="5" strokeLinecap="round" opacity="0.96" />
        <path d="M148 186H1052" stroke={`url(#${ids.goldDark})`} strokeWidth="6" strokeLinecap="round" opacity="0.9" />
        <path d="M151 49H1049" stroke="rgba(255,250,220,.82)" strokeWidth="1.8" strokeLinecap="round" opacity="0.92" />
        <path d="M151 180H1049" stroke="rgba(9,18,34,.64)" strokeWidth="2.2" strokeLinecap="round" opacity="0.68" />

        {/* center top/bottom diamond */}
        <g>
          <path d="M600 2L625 27L600 52L575 27Z" fill={`url(#${ids.gold})`} />
          <path d="M600 13L614 27L600 41L586 27Z" fill={`url(#${ids.gem})`} />
          <path d="M600 178L625 205L600 228L575 205Z" fill={`url(#${ids.goldDark})`} />
          <path d="M600 191L613 205L600 218L587 205Z" fill={`url(#${ids.gem})`} />
        </g>

        {/* side gems */}
        <SideGem ids={ids} />
        <SideGem ids={ids} right />

        {/* ornate corner leaves */}
        <CornerOrnaments ids={ids} />
        <CornerOrnaments ids={ids} right />
      </g>
    </svg>
  );
}

function SideGem({ ids, right = false }: { ids: Record<string, string>; right?: boolean }) {
  return (
    <g transform={right ? 'translate(1200 0) scale(-1 1)' : undefined}>
      <path d="M39 115L73 72L107 115L73 158Z" fill={`url(#${ids.gold})`} />
      <path d="M52 115L73 89L94 115L73 141Z" fill={`url(#${ids.gem})`} />
      <path d="M73 95L87 115L73 135L59 115Z" fill={`url(#${ids.gemDark})`} opacity="0.92" />
      <path d="M73 101L82 115L73 129L64 115Z" fill="#E8FFFF" opacity="0.9" />
      <path d="M105 115H133" stroke={`url(#${ids.gold})`} strokeWidth="7" strokeLinecap="round" />
    </g>
  );
}

function CornerOrnaments({ ids, right = false }: { ids: Record<string, string>; right?: boolean }) {
  return (
    <g transform={right ? 'translate(1200 0) scale(-1 1)' : undefined}>
      {/* upper curls */}
      <path d="M108 58C132 42 152 39 183 39" stroke={`url(#${ids.gold})`} strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d="M125 76C151 59 171 53 204 53" stroke={`url(#${ids.goldDark})`} strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.92" />
      <path d="M150 42C159 31 172 23 191 19C184 36 171 46 150 42Z" fill={`url(#${ids.gold})`} />
      <path d="M130 66C141 55 157 50 177 50C165 66 148 73 130 66Z" fill={`url(#${ids.gold})`} />
      <path d="M108 88C117 77 132 69 151 66C143 82 128 92 108 88Z" fill={`url(#${ids.goldDark})`} />

      {/* lower curls */}
      <path d="M108 172C132 188 152 191 183 191" stroke={`url(#${ids.goldDark})`} strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d="M125 154C151 171 171 177 204 177" stroke={`url(#${ids.gold})`} strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.92" />
      <path d="M150 188C159 199 172 207 191 211C184 194 171 184 150 188Z" fill={`url(#${ids.goldDark})`} />
      <path d="M130 164C141 175 157 180 177 180C165 164 148 157 130 164Z" fill={`url(#${ids.gold})`} />
      <path d="M108 142C117 153 132 161 151 164C143 148 128 138 108 142Z" fill={`url(#${ids.gold})`} />
    </g>
  );
}

function ReferenceCompassBadge() {
  const rawId = useId().replace(/:/g, '');
  const gold = `ref-compass-gold-${rawId}`;
  const gem = `ref-compass-gem-${rawId}`;
  return (
    <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true" className="ft-reference-button__compass">
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF7D8" />
          <stop offset=".45" stopColor="#E0AF52" />
          <stop offset="1" stopColor="#7A4A18" />
        </linearGradient>
        <linearGradient id={gem} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EEFFFF" />
          <stop offset=".5" stopColor="#48C8FF" />
          <stop offset="1" stopColor="#0B50C8" />
        </linearGradient>
      </defs>
      <circle cx="48" cy="48" r="32" fill="none" stroke={`url(#${gold})`} strokeWidth="5" opacity="0.95" />
      <path d="M48 4L58 38L92 48L58 58L48 92L38 58L4 48L38 38Z" fill={`url(#${gold})`} />
      <path d="M48 18L54 42L78 48L54 54L48 78L42 54L18 48L42 42Z" fill="#FFF5D0" opacity="0.9" />
      <path d="M48 33L63 48L48 63L33 48Z" fill={`url(#${gem})`} />
      <circle cx="48" cy="48" r="7" fill="#081F42" opacity="0.42" />
      <circle cx="48" cy="48" r="4" fill="#C7F6FF" opacity="0.85" />
    </svg>
  );
}

export const ReferenceFantasyButton = forwardRef<HTMLButtonElement, ReferenceFantasyButtonProps>(function ReferenceFantasyButton(
  {
    leadingIcon,
    trailingIcon,
    children = '新建任务',
    size = 'lg',
    block = false,
    disabled,
    className,
    type = 'button',
    ...rest
  },
  ref,
) {
  const classes = [
    'ft-reference-button',
    `ft-reference-button--${size}`,
    block ? 'ft-reference-button--block' : '',
    disabled ? 'is-disabled' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} type={type} className={classes} disabled={disabled} {...rest}>
      <ReferenceButtonArt disabled={disabled} />
      <span className="ft-reference-button__glint" aria-hidden="true" />
      <span className="ft-reference-button__content">
        <span className="ft-reference-button__icon">{leadingIcon ?? <ReferenceCompassBadge />}</span>
        <span className="ft-reference-button__label" data-shine={typeof children === 'string' ? children : undefined}>{children}</span>
        {trailingIcon ? <span className="ft-reference-button__trailing">{trailingIcon}</span> : null}
      </span>
    </button>
  );
});
