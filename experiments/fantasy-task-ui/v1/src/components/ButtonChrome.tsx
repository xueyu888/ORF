import { useId, type CSSProperties } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'subtle';

const paletteMap: Record<Variant, {
  fillTop: string;
  fillBottom: string;
  innerTop: string;
  innerBottom: string;
  text: string;
  glow: string;
  gem: string;
  gemDark: string;
  strokeLight: string;
  strokeDark: string;
  filigree: string;
}> = {
  primary: {
    fillTop: '#2C69A9',
    fillBottom: '#0B2B57',
    innerTop: '#5F8FD1',
    innerBottom: '#103867',
    text: '#FFF0C2',
    glow: 'rgba(255, 227, 144, 0.38)',
    gem: '#4CB7FF',
    gemDark: '#1D5FDA',
    strokeLight: '#FDE7A8',
    strokeDark: '#926127',
    filigree: 'rgba(167, 202, 255, 0.18)'
  },
  secondary: {
    fillTop: '#FFFDF8',
    fillBottom: '#EDE0C6',
    innerTop: '#FFFDF9',
    innerBottom: '#F6EAD6',
    text: '#283241',
    glow: 'rgba(255, 255, 255, 0.65)',
    gem: '#F8E8A7',
    gemDark: '#D09A32',
    strokeLight: '#FFF1B7',
    strokeDark: '#A87433',
    filigree: 'rgba(171, 146, 93, 0.12)'
  },
  ghost: {
    fillTop: '#FFFDFC',
    fillBottom: '#F5F4F0',
    innerTop: '#FFFDFC',
    innerBottom: '#FAF8F4',
    text: '#2E5D99',
    glow: 'rgba(255, 255, 255, 0.72)',
    gem: '#89D6FF',
    gemDark: '#4C7FD4',
    strokeLight: '#FCEAB0',
    strokeDark: '#B1823B',
    filigree: 'rgba(92, 131, 205, 0.14)'
  },
  danger: {
    fillTop: '#C24F43',
    fillBottom: '#7F2825',
    innerTop: '#D96757',
    innerBottom: '#932E2D',
    text: '#FFF0CB',
    glow: 'rgba(255, 208, 132, 0.28)',
    gem: '#FFD07E',
    gemDark: '#DA8F28',
    strokeLight: '#FBE6A3',
    strokeDark: '#8F5A23',
    filigree: 'rgba(255, 211, 150, 0.14)'
  },
  success: {
    fillTop: '#43A69B',
    fillBottom: '#236D67',
    innerTop: '#66C2B7',
    innerBottom: '#2B7A73',
    text: '#FFF2CF',
    glow: 'rgba(255, 251, 214, 0.28)',
    gem: '#A7FFF2',
    gemDark: '#2F9C95',
    strokeLight: '#FAE8AA',
    strokeDark: '#946529',
    filigree: 'rgba(184, 255, 246, 0.12)'
  },
  subtle: {
    fillTop: '#FFFDF9',
    fillBottom: '#F3E9D5',
    innerTop: '#FFFDFC',
    innerBottom: '#F9F1E1',
    text: '#463624',
    glow: 'rgba(255, 255, 255, 0.6)',
    gem: '#FFF0B8',
    gemDark: '#D39B30',
    strokeLight: '#FFF0B1',
    strokeDark: '#AF7D36',
    filigree: 'rgba(157, 116, 55, 0.12)'
  }
};

export interface ButtonChromeProps {
  variant: Variant;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

function SideFlourish({ right = false, stroke, gem, gemDark }: { right?: boolean; stroke: string; gem: string; gemDark: string }) {
  const transform = right ? 'translate(1000,0) scale(-1,1)' : undefined;
  return (
    <g transform={transform} opacity="0.95">
      <path
        d="M18 91 C 33 88, 52 73, 76 43 C 83 33, 96 28, 111 28 L 126 28"
        stroke={stroke}
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M22 93 C 38 110, 55 124, 76 141 C 87 150, 101 154, 114 154 L 126 154"
        stroke={stroke}
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M34 90 L 58 66 L 83 90 L 58 114 Z"
        fill={`url(#${gem})`}
        stroke={stroke}
        strokeWidth="5"
      />
      <path d="M58 74 L 73 90 L 58 106 L 43 90 Z" fill={`url(#${gemDark})`} opacity="0.85" />
      <circle cx="106" cy="89" r="3.2" fill={stroke} opacity="0.9" />
    </g>
  );
}

export function ButtonChrome({ variant, disabled, className, style }: ButtonChromeProps) {
  const p = paletteMap[variant];
  const opacity = disabled ? 0.55 : 1;
  const uid = useId().replace(/:/g, '');
  const frameGold = `frameGold-${uid}`;
  const surfaceFill = `surfaceFill-${uid}`;
  const innerSurface = `innerSurface-${uid}`;
  const shineLine = `shineLine-${uid}`;
  const gemFill = `gemFill-${uid}`;
  const gemFillDark = `gemFillDark-${uid}`;
  const centerGlow = `centerGlow-${uid}`;
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
          <stop offset="38%" stopColor="#E6C46F" />
          <stop offset="58%" stopColor="#D09B3B" />
          <stop offset="100%" stopColor={p.strokeDark} />
        </linearGradient>
        <linearGradient id={surfaceFill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.fillTop} />
          <stop offset="100%" stopColor={p.fillBottom} />
        </linearGradient>
        <linearGradient id={innerSurface} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.innerTop} />
          <stop offset="100%" stopColor={p.innerBottom} />
        </linearGradient>
        <linearGradient id={shineLine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
        </linearGradient>
        <linearGradient id={gemFill} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="18%" stopColor={p.gem} />
          <stop offset="100%" stopColor={p.gemDark} />
        </linearGradient>
        <linearGradient id={gemFillDark} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={p.gemDark} />
          <stop offset="100%" stopColor="#0F375F" />
        </linearGradient>
        <radialGradient id={centerGlow} cx="50%" cy="48%" r="52%">
          <stop offset="0%" stopColor={p.glow} />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <filter id={shadow} x="-10%" y="-20%" width="120%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="rgba(45,23,4,0.34)" />
        </filter>
      </defs>

      <g filter={`url(#${shadow})`} opacity={opacity}>
        <path
          d="M96 12 H 904 C 934 12 960 30 972 56 C 978 68 982 77 988 81 C 995 86 995 96 988 101 C 982 105 978 114 972 126 C 960 152 934 170 904 170 H 96 C 66 170 40 152 28 126 C 22 114 18 105 12 101 C 5 96 5 86 12 81 C 18 77 22 68 28 56 C 40 30 66 12 96 12 Z"
          fill={`url(#${frameGold})`}
        />
        <path
          d="M103 21 H 897 C 926 21 949 37 958 60 C 964 75 968 82 977 89 C 968 96 964 107 958 122 C 949 145 926 161 897 161 H 103 C 74 161 51 145 42 122 C 36 107 32 96 23 89 C 32 82 36 75 42 60 C 51 37 74 21 103 21 Z"
          fill={`url(#${surfaceFill})`}
        />
        <path
          d="M126 35 H 874 C 901 35 920 50 927 73 C 931 85 935 88 940 91 C 935 94 931 97 927 109 C 920 132 901 147 874 147 H 126 C 99 147 80 132 73 109 C 69 97 65 94 60 91 C 65 88 69 85 73 73 C 80 50 99 35 126 35 Z"
          fill={`url(#${innerSurface})`}
          stroke="rgba(255,247,218,0.64)"
          strokeWidth="1.4"
        />

        <ellipse cx="500" cy="92" rx="330" ry="62" fill={`url(#${centerGlow})`} opacity="0.9" />

        <path d="M132 40 H 868" stroke={`url(#${shineLine})`} strokeWidth="2.2" opacity="0.9" />
        <path d="M136 140 H 864" stroke="rgba(70,31,0,0.22)" strokeWidth="1.8" opacity="0.8" />

        <g opacity="0.95">
          <path d="M500 5 L 514 19 L 500 33 L 486 19 Z" fill={`url(#${frameGold})`} />
          <path d="M500 149 L 514 163 L 500 177 L 486 163 Z" fill={`url(#${frameGold})`} />
          <path d="M500 14 L 506 20 L 500 26 L 494 20 Z" fill={`url(#${gemFill})`} />
        </g>

        <SideFlourish stroke={`url(#${frameGold})`} gem={gemFill} gemDark={gemFillDark} />
        <SideFlourish right stroke={`url(#${frameGold})`} gem={gemFill} gemDark={gemFillDark} />

        <g opacity="0.65">
          <path d="M155 53 C 185 68, 198 91, 189 120" stroke={p.filigree} strokeWidth="3" fill="none" />
          <path d="M845 53 C 815 68, 802 91, 811 120" stroke={p.filigree} strokeWidth="3" fill="none" />
          <path d="M500 48 C 525 60, 540 88, 534 118 C 510 109, 490 109, 466 118 C 460 88, 475 60, 500 48 Z" stroke={p.filigree} strokeWidth="3" fill="none" />
          <path d="M500 61 L 514 90 L 500 119 L 486 90 Z" stroke={p.filigree} strokeWidth="2" fill="none" />
        </g>
      </g>
    </svg>
  );
}
