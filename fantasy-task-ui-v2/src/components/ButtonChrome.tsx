import { useId, type CSSProperties } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'subtle';

type Palette = {
  fillTop: string;
  fillMid: string;
  fillBottom: string;
  innerTop: string;
  innerBottom: string;
  glow: string;
  gem: string;
  gemDark: string;
  gemLight: string;
  strokeLight: string;
  strokeMid: string;
  strokeDark: string;
  filigree: string;
  edgeShadow: string;
};

const paletteMap: Record<Variant, Palette> = {
  primary: {
    fillTop: '#4D84D3',
    fillMid: '#1E5FA9',
    fillBottom: '#0A2750',
    innerTop: '#6E9CE0',
    innerBottom: '#123C72',
    glow: 'rgba(191, 225, 255, 0.28)',
    gem: '#7FE3FF',
    gemDark: '#1F6DE3',
    gemLight: '#E6FFFF',
    strokeLight: '#FFE9A9',
    strokeMid: '#D7A53A',
    strokeDark: '#7A4B19',
    filigree: 'rgba(190, 224, 255, 0.18)',
    edgeShadow: 'rgba(26, 13, 2, 0.45)',
  },
  secondary: {
    fillTop: '#FFF9EA',
    fillMid: '#F7E9CD',
    fillBottom: '#E7D7B6',
    innerTop: '#FFFDF9',
    innerBottom: '#F8EDDB',
    glow: 'rgba(255, 255, 255, 0.52)',
    gem: '#FFF1B7',
    gemDark: '#D8A041',
    gemLight: '#FFFDF3',
    strokeLight: '#FFF1B8',
    strokeMid: '#DEAC49',
    strokeDark: '#916328',
    filigree: 'rgba(152, 111, 49, 0.12)',
    edgeShadow: 'rgba(73, 43, 11, 0.28)',
  },
  ghost: {
    fillTop: '#FFFDFC',
    fillMid: '#F6EEE1',
    fillBottom: '#ECE6DD',
    innerTop: '#FFFFFF',
    innerBottom: '#F8F7F2',
    glow: 'rgba(255, 255, 255, 0.56)',
    gem: '#91DEFF',
    gemDark: '#4F84D7',
    gemLight: '#EFFCFF',
    strokeLight: '#FFF0B3',
    strokeMid: '#D9A74B',
    strokeDark: '#A07230',
    filigree: 'rgba(103, 140, 210, 0.14)',
    edgeShadow: 'rgba(73, 43, 11, 0.24)',
  },
  danger: {
    fillTop: '#E26F56',
    fillMid: '#B53A33',
    fillBottom: '#6F1E1C',
    innerTop: '#ED846A',
    innerBottom: '#9B2B29',
    glow: 'rgba(255, 197, 131, 0.22)',
    gem: '#FFD77F',
    gemDark: '#D9811C',
    gemLight: '#FFF8DE',
    strokeLight: '#FCE8AC',
    strokeMid: '#D4A241',
    strokeDark: '#89501C',
    filigree: 'rgba(255, 212, 164, 0.14)',
    edgeShadow: 'rgba(39, 8, 6, 0.44)',
  },
  success: {
    fillTop: '#5BC5BC',
    fillMid: '#2B9B96',
    fillBottom: '#1B5854',
    innerTop: '#76D3CB',
    innerBottom: '#2E7C77',
    glow: 'rgba(202, 255, 247, 0.18)',
    gem: '#B3FFF3',
    gemDark: '#2F9F98',
    gemLight: '#F4FFFC',
    strokeLight: '#FCE8AA',
    strokeMid: '#D2A543',
    strokeDark: '#8B5A22',
    filigree: 'rgba(211, 255, 247, 0.14)',
    edgeShadow: 'rgba(6, 28, 27, 0.42)',
  },
  subtle: {
    fillTop: '#FFF9F1',
    fillMid: '#F5E8D0',
    fillBottom: '#EADCBF',
    innerTop: '#FFFDF9',
    innerBottom: '#F8EFDD',
    glow: 'rgba(255, 255, 255, 0.5)',
    gem: '#FFF0B8',
    gemDark: '#D39B30',
    gemLight: '#FFFDF1',
    strokeLight: '#FFF0B0',
    strokeMid: '#D8A647',
    strokeDark: '#996C2A',
    filigree: 'rgba(151, 111, 50, 0.12)',
    edgeShadow: 'rgba(62, 34, 10, 0.24)',
  },
};

export interface ButtonChromeProps {
  variant: Variant;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

function SideWing({ right = false, stroke, gem, gemDark, gemLight }: {
  right?: boolean;
  stroke: string;
  gem: string;
  gemDark: string;
  gemLight: string;
}) {
  const transform = right ? 'translate(1000,0) scale(-1,1)' : undefined;
  return (
    <g transform={transform} opacity="0.98">
      <path
        d="M17 91 C 33 85, 53 66, 67 43 C 75 30, 91 24, 113 24"
        stroke={stroke}
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M19 91 C 34 99, 49 118, 67 141 C 77 153, 94 158, 113 158"
        stroke={stroke}
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M33 91 L 58 63 L 84 91 L 58 119 Z"
        fill={`url(#${gem})`}
        stroke={stroke}
        strokeWidth="5"
      />
      <path d="M58 71 L 76 91 L 58 111 L 40 91 Z" fill={`url(#${gemDark})`} opacity="0.92" />
      <path d="M58 78 L 69 91 L 58 104 L 47 91 Z" fill={`url(#${gemLight})`} opacity="0.9" />
      <path d="M90 91 H 112" stroke={stroke} strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
      <circle cx="114" cy="91" r="2.7" fill={stroke} opacity="0.9" />
    </g>
  );
}

export function ButtonChrome({ variant, disabled, className, style }: ButtonChromeProps) {
  const p = paletteMap[variant];
  const opacity = disabled ? 0.54 : 1;
  const uid = useId().replace(/:/g, '');
  const frameGold = `frameGold-${uid}`;
  const frameGold2 = `frameGold2-${uid}`;
  const outerEdge = `outerEdge-${uid}`;
  const surfaceFill = `surfaceFill-${uid}`;
  const innerSurface = `innerSurface-${uid}`;
  const bevelLine = `bevelLine-${uid}`;
  const shineLine = `shineLine-${uid}`;
  const gemFill = `gemFill-${uid}`;
  const gemFillDark = `gemFillDark-${uid}`;
  const gemFillLight = `gemFillLight-${uid}`;
  const centerGlow = `centerGlow-${uid}`;
  const topGloss = `topGloss-${uid}`;
  const bottomShade = `bottomShade-${uid}`;
  const shadow = `shadow-${uid}`;

  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 1000 182"
      preserveAspectRatio="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={frameGold} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.strokeLight} />
          <stop offset="30%" stopColor="#F0CF72" />
          <stop offset="58%" stopColor={p.strokeMid} />
          <stop offset="100%" stopColor={p.strokeDark} />
        </linearGradient>
        <linearGradient id={frameGold2} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff7d9" />
          <stop offset="45%" stopColor="#e9bb5f" />
          <stop offset="100%" stopColor="#8f5f21" />
        </linearGradient>
        <linearGradient id={outerEdge} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
          <stop offset="100%" stopColor={p.edgeShadow} />
        </linearGradient>
        <linearGradient id={surfaceFill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.fillTop} />
          <stop offset="45%" stopColor={p.fillMid} />
          <stop offset="100%" stopColor={p.fillBottom} />
        </linearGradient>
        <linearGradient id={innerSurface} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.innerTop} />
          <stop offset="100%" stopColor={p.innerBottom} />
        </linearGradient>
        <linearGradient id={bevelLine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.72)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
        </linearGradient>
        <linearGradient id={shineLine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <linearGradient id={topGloss} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.34)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <linearGradient id={bottomShade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.28)" />
        </linearGradient>
        <linearGradient id={gemFill} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={p.gemLight} />
          <stop offset="24%" stopColor={p.gem} />
          <stop offset="100%" stopColor={p.gemDark} />
        </linearGradient>
        <linearGradient id={gemFillDark} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={p.gemDark} />
          <stop offset="100%" stopColor="#143C64" />
        </linearGradient>
        <linearGradient id={gemFillLight} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor={p.gem} />
        </linearGradient>
        <radialGradient id={centerGlow} cx="50%" cy="45%" r="54%">
          <stop offset="0%" stopColor={p.glow} />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <filter id={shadow} x="-12%" y="-25%" width="124%" height="180%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="rgba(23,11,4,0.28)" />
          <feDropShadow dx="0" dy="11" stdDeviation="4" floodColor="rgba(23,11,4,0.14)" />
        </filter>
      </defs>

      <g filter={`url(#${shadow})`} opacity={opacity}>
        <path
          d="M95 12 H905 C936 12 960 31 972 57 C978 69 983 78 989 82 C995 86 995 96 989 100 C983 104 978 113 972 125 C960 151 936 170 905 170 H95 C64 170 40 151 28 125 C22 113 17 104 11 100 C5 96 5 86 11 82 C17 78 22 69 28 57 C40 31 64 12 95 12 Z"
          fill={`url(#${frameGold})`}
        />
        <path
          d="M99 16 H901 C931 16 953 33 964 58 C969 70 973 78 980 82 C986 86 986 96 980 100 C973 104 969 112 964 124 C953 149 931 166 901 166 H99 C69 166 47 149 36 124 C31 112 27 104 20 100 C14 96 14 86 20 82 C27 78 31 70 36 58 C47 33 69 16 99 16 Z"
          fill="none"
          stroke={`url(#${outerEdge})`}
          strokeWidth="3"
          opacity="0.82"
        />
        <path
          d="M104 22 H896 C924 22 946 38 955 61 C960 74 964 81 972 88 C964 95 960 108 955 121 C946 144 924 160 896 160 H104 C76 160 54 144 45 121 C40 108 36 95 28 88 C36 81 40 74 45 61 C54 38 76 22 104 22 Z"
          fill={`url(#${surfaceFill})`}
        />
        <path
          d="M118 32 H882 C909 32 927 47 934 68 C938 82 942 86 947 89 C942 92 938 96 934 110 C927 131 909 146 882 146 H118 C91 146 73 131 66 110 C62 96 58 92 53 89 C58 86 62 82 66 68 C73 47 91 32 118 32 Z"
          fill={`url(#${innerSurface})`}
        />
        <path
          d="M127 39 H873 C898 39 916 52 921 73 C924 83 928 87 931 89 C928 91 924 95 921 105 C916 126 898 139 873 139 H127 C102 139 84 126 79 105 C76 95 72 91 69 89 C72 87 76 83 79 73 C84 52 102 39 127 39 Z"
          fill="none"
          stroke={`url(#${bevelLine})`}
          strokeWidth="1.7"
          opacity="0.92"
        />

        <path d="M122 34 H878" stroke={`url(#${shineLine})`} strokeWidth="2.1" opacity="0.88" />
        <path d="M122 149 H878" stroke="rgba(46,20,1,0.20)" strokeWidth="2" opacity="0.78" />

        <ellipse cx="500" cy="89" rx="335" ry="60" fill={`url(#${centerGlow})`} opacity="0.94" />
        <path d="M146 40 C 300 64, 700 64, 854 40 L 854 58 C 700 78, 300 78, 146 58 Z" fill={`url(#${topGloss})`} opacity="0.8" />
        <path d="M146 115 C 300 135, 700 135, 854 115 L 854 142 C 700 155, 300 155, 146 142 Z" fill={`url(#${bottomShade})`} opacity="0.55" />

        <g opacity="0.96">
          <path d="M500 6 L 514 20 L 500 34 L 486 20 Z" fill={`url(#${frameGold})`} />
          <path d="M500 148 L 514 162 L 500 176 L 486 162 Z" fill={`url(#${frameGold})`} />
          <path d="M500 14 L 507 21 L 500 28 L 493 21 Z" fill={`url(#${gemFill})`} />
        </g>

        <SideWing stroke={`url(#${frameGold2})`} gem={gemFill} gemDark={gemFillDark} gemLight={gemFillLight} />
        <SideWing right stroke={`url(#${frameGold2})`} gem={gemFill} gemDark={gemFillDark} gemLight={gemFillLight} />

        <g opacity="0.62">
          <path d="M171 47 C 190 58, 202 72, 205 92 C 202 111, 190 125, 171 135" stroke={p.filigree} strokeWidth="2.5" fill="none" />
          <path d="M829 47 C 810 58, 798 72, 795 92 C 798 111, 810 125, 829 135" stroke={p.filigree} strokeWidth="2.5" fill="none" />
          <path d="M500 50 C 523 62, 537 87, 532 114 C 509 108, 491 108, 468 114 C 463 87, 477 62, 500 50 Z" stroke={p.filigree} strokeWidth="2.6" fill="none" />
          <path d="M500 60 L 515 89 L 500 118 L 485 89 Z" stroke={p.filigree} strokeWidth="1.9" fill="none" />
          <path d="M500 70 L 509 89 L 500 108 L 491 89 Z" stroke={p.filigree} strokeWidth="1.5" fill="none" opacity="0.75" />
        </g>

        <g opacity="0.76">
          <circle cx="158" cy="89" r="1.4" fill={`url(#${frameGold2})`} />
          <circle cx="842" cy="89" r="1.4" fill={`url(#${frameGold2})`} />
          <circle cx="182" cy="89" r="1.1" fill={`url(#${frameGold2})`} />
          <circle cx="818" cy="89" r="1.1" fill={`url(#${frameGold2})`} />
        </g>
      </g>
    </svg>
  );
}
