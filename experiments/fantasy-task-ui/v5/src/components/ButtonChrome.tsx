import { useId, type CSSProperties } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'subtle';

type Palette = {
  frameLight: string;
  frameMid: string;
  frameDark: string;
  shellStroke: string;
  fillTop: string;
  fillMid: string;
  fillBottom: string;
  innerTop: string;
  innerBottom: string;
  highlight: string;
  glow: string;
  filigree: string;
  gemLight: string;
  gemMid: string;
  gemDark: string;
  shadow: string;
};

const palettes: Record<Variant, Palette> = {
  primary: {
    frameLight: '#FFF3BC',
    frameMid: '#D8A442',
    frameDark: '#6C4214',
    shellStroke: 'rgba(255,255,255,0.76)',
    fillTop: '#679DEB',
    fillMid: '#2164B3',
    fillBottom: '#0A2854',
    innerTop: '#8CB4F2',
    innerBottom: '#153F76',
    highlight: 'rgba(255,255,255,0.92)',
    glow: 'rgba(208,231,255,0.30)',
    filigree: 'rgba(202,230,255,0.20)',
    gemLight: '#F0FFFF',
    gemMid: '#6DDAFF',
    gemDark: '#216BE1',
    shadow: 'rgba(16,9,4,0.34)',
  },
  secondary: {
    frameLight: '#FFF4BF',
    frameMid: '#DEAC49',
    frameDark: '#8C6027',
    shellStroke: 'rgba(255,255,255,0.84)',
    fillTop: '#FFF9ED',
    fillMid: '#F4E7CB',
    fillBottom: '#E4D3AE',
    innerTop: '#FFFDF9',
    innerBottom: '#F7EAD4',
    highlight: 'rgba(255,255,255,0.96)',
    glow: 'rgba(255,255,255,0.56)',
    filigree: 'rgba(164,122,52,0.12)',
    gemLight: '#FFFDF1',
    gemMid: '#F5DF98',
    gemDark: '#D3942E',
    shadow: 'rgba(56,32,7,0.24)',
  },
  ghost: {
    frameLight: '#FFF4C0',
    frameMid: '#DFAF4C',
    frameDark: '#9A6E30',
    shellStroke: 'rgba(255,255,255,0.88)',
    fillTop: '#FFFDFC',
    fillMid: '#F5EEE4',
    fillBottom: '#EBE3D7',
    innerTop: '#FFFFFF',
    innerBottom: '#FAF8F1',
    highlight: 'rgba(255,255,255,0.99)',
    glow: 'rgba(255,255,255,0.66)',
    filigree: 'rgba(107,143,209,0.16)',
    gemLight: '#F3FFFF',
    gemMid: '#8BD8FF',
    gemDark: '#4D7CD4',
    shadow: 'rgba(56,32,7,0.22)',
  },
  danger: {
    frameLight: '#FDEDB4',
    frameMid: '#D8A13B',
    frameDark: '#7E4818',
    shellStroke: 'rgba(255,255,255,0.76)',
    fillTop: '#EE856B',
    fillMid: '#B83A34',
    fillBottom: '#6B1F1C',
    innerTop: '#F49A7F',
    innerBottom: '#A32D2A',
    highlight: 'rgba(255,236,214,0.98)',
    glow: 'rgba(255,213,155,0.23)',
    filigree: 'rgba(255,213,164,0.16)',
    gemLight: '#FFF7E2',
    gemMid: '#FFD67E',
    gemDark: '#D98518',
    shadow: 'rgba(24,7,6,0.36)',
  },
  success: {
    frameLight: '#FDECB3',
    frameMid: '#D6A43F',
    frameDark: '#83561F',
    shellStroke: 'rgba(255,255,255,0.78)',
    fillTop: '#79DACF',
    fillMid: '#2E9F99',
    fillBottom: '#195754',
    innerTop: '#8DE1D8',
    innerBottom: '#2C7A75',
    highlight: 'rgba(255,255,255,0.95)',
    glow: 'rgba(219,255,248,0.22)',
    filigree: 'rgba(211,255,245,0.17)',
    gemLight: '#F5FFFC',
    gemMid: '#B2FFF2',
    gemDark: '#2C9C95',
    shadow: 'rgba(7,28,27,0.34)',
  },
  subtle: {
    frameLight: '#FFF2B9',
    frameMid: '#DDAB46',
    frameDark: '#97682A',
    shellStroke: 'rgba(255,255,255,0.84)',
    fillTop: '#FFF8F1',
    fillMid: '#F3E8D4',
    fillBottom: '#E8DCC0',
    innerTop: '#FFFDF9',
    innerBottom: '#F8EEDC',
    highlight: 'rgba(255,255,255,0.96)',
    glow: 'rgba(255,255,255,0.50)',
    filigree: 'rgba(150,112,52,0.14)',
    gemLight: '#FFFDF1',
    gemMid: '#FFF0BA',
    gemDark: '#D39B30',
    shadow: 'rgba(50,29,10,0.22)',
  },
};

const outerPath = 'M95 12 H905 C936 12 960 31 972 57 C978 69 983 78 989 82 C995 86 995 96 989 100 C983 104 978 113 972 125 C960 151 936 170 905 170 H95 C64 170 40 151 28 125 C22 113 17 104 11 100 C5 96 5 86 11 82 C17 78 22 69 28 57 C40 31 64 12 95 12 Z';
const shellPath = 'M104 22 H896 C924 22 946 38 955 61 C960 74 964 81 972 88 C964 95 960 108 955 121 C946 144 924 160 896 160 H104 C76 160 54 144 45 121 C40 108 36 95 28 88 C36 81 40 74 45 61 C54 38 76 22 104 22 Z';
const innerPath = 'M118 32 H882 C909 32 927 47 934 68 C938 82 942 86 947 89 C942 92 938 96 934 110 C927 131 909 146 882 146 H118 C91 146 73 131 66 110 C62 96 58 92 53 89 C58 86 62 82 66 68 C73 47 91 32 118 32 Z';
const insetPath = 'M127 39 H873 C898 39 916 52 921 73 C924 83 928 87 931 89 C928 91 924 95 921 105 C916 126 898 139 873 139 H127 C102 139 84 126 79 105 C76 95 72 91 69 89 C72 87 76 83 79 73 C84 52 102 39 127 39 Z';

export interface ButtonChromeProps {
  variant: Variant;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

type SharedIds = {
  frame: string;
  frameAlt: string;
  fill: string;
  fillInner: string;
  gem: string;
  gemDark: string;
  gemLight: string;
  gloss: string;
  bevel: string;
  glow: string;
  softShadow: string;
};

function CoreShell({ p, ids }: { p: Palette; ids: SharedIds }) {
  return (
    <>
      <path d={outerPath} fill={`url(#${ids.frame})`} />
      <path d="M99 16 H901 C931 16 953 33 964 58 C969 70 973 78 980 82 C986 86 986 96 980 100 C973 104 969 112 964 124 C953 149 931 166 901 166 H99 C69 166 47 149 36 124 C31 112 27 104 20 100 C14 96 14 86 20 82 C27 78 31 70 36 58 C47 33 69 16 99 16 Z" fill="none" stroke={p.shellStroke} strokeWidth="2.9" opacity="0.82" />
      <path d={shellPath} fill={`url(#${ids.fill})`} />
      <path d={innerPath} fill={`url(#${ids.fillInner})`} />
      <path d={insetPath} fill="none" stroke={`url(#${ids.bevel})`} strokeWidth="1.7" opacity="0.98" />
      <path d="M122 34 H878" stroke={`url(#${ids.gloss})`} strokeWidth="2" opacity="0.92" />
      <path d="M122 149 H878" stroke="rgba(46,20,1,0.18)" strokeWidth="2" opacity="0.78" />
      <ellipse cx="500" cy="89" rx="336" ry="59" fill={`url(#${ids.glow})`} opacity="0.96" />
      <path d="M146 39 C 310 63, 690 63, 854 39 L 854 56 C 690 76, 310 76, 146 56 Z" fill={`url(#${ids.gloss})`} opacity="0.38" />
      <path d="M148 121 C 310 138, 690 138, 852 121 L 852 142 C 690 153, 310 153, 148 142 Z" fill={`url(#${ids.softShadow})`} opacity="0.34" />
      <g opacity="0.98">
        <path d="M500 6 L 514 20 L 500 34 L 486 20 Z" fill={`url(#${ids.frameAlt})`} />
        <path d="M500 148 L 514 162 L 500 176 L 486 162 Z" fill={`url(#${ids.frameAlt})`} />
        <path d="M500 14 L 507 21 L 500 28 L 493 21 Z" fill={`url(#${ids.gem})`} />
      </g>
      <g opacity="0.66">
        <circle cx="158" cy="89" r="1.45" fill={`url(#${ids.frameAlt})`} />
        <circle cx="842" cy="89" r="1.45" fill={`url(#${ids.frameAlt})`} />
        <circle cx="182" cy="89" r="1.1" fill={`url(#${ids.frameAlt})`} />
        <circle cx="818" cy="89" r="1.1" fill={`url(#${ids.frameAlt})`} />
      </g>
    </>
  );
}

function SideWing({ ids, right = false, sharp = false, elegant = false }: { ids: SharedIds; right?: boolean; sharp?: boolean; elegant?: boolean }) {
  const transform = right ? 'translate(1000,0) scale(-1,1)' : undefined;
  const upper = sharp
    ? 'M18 91 C 30 85, 45 64, 61 40 C 70 27, 88 24, 112 24'
    : elegant
      ? 'M18 91 C 38 86, 56 67, 73 48 C 83 36, 97 28, 114 28'
      : 'M18 91 C 33 85, 53 66, 67 43 C 75 30, 91 24, 113 24';
  const lower = sharp
    ? 'M18 91 C 30 97, 45 118, 61 142 C 70 155, 88 158, 112 158'
    : elegant
      ? 'M18 91 C 38 96, 56 115, 73 134 C 83 146, 97 154, 114 154'
      : 'M18 91 C 33 99, 53 118, 67 141 C 75 152, 91 158, 113 158';
  return (
    <g transform={transform} opacity="0.98">
      <path d={upper} stroke={`url(#${ids.frameAlt})`} strokeWidth="7.6" fill="none" strokeLinecap="round" />
      <path d={lower} stroke={`url(#${ids.frameAlt})`} strokeWidth="7.6" fill="none" strokeLinecap="round" />
      <path d="M33 91 L 58 63 L 84 91 L 58 119 Z" fill={`url(#${ids.gem})`} stroke={`url(#${ids.frameAlt})`} strokeWidth="4.6" />
      <path d="M58 71 L 76 91 L 58 111 L 40 91 Z" fill={`url(#${ids.gemDark})`} opacity="0.94" />
      <path d="M58 78 L 69 91 L 58 104 L 47 91 Z" fill={`url(#${ids.gemLight})`} opacity="0.84" />
      <path d="M90 91 H112" stroke={`url(#${ids.frameAlt})`} strokeWidth="4.6" strokeLinecap="round" opacity="0.95" />
      <circle cx="114" cy="91" r="2.6" fill={`url(#${ids.frameAlt})`} opacity="0.88" />
    </g>
  );
}

function Crest({ ids, type }: { ids: SharedIds; type: 'star' | 'seal' | 'cross' | 'spike' | 'laurel' | 'diamond' }) {
  switch (type) {
    case 'star':
      return (
        <g opacity="0.62">
          <path d="M500 49 C 522 61, 536 86, 531 113 C 509 107, 491 107, 469 113 C 464 86, 478 61, 500 49 Z" stroke="currentColor" strokeWidth="0" fill="none" />
          <path d="M500 58 L 512 80 L 536 89 L 512 98 L 500 120 L 488 98 L 464 89 L 488 80 Z" stroke="var(--filigree)" fill="none" />
        </g>
      );
    default:
      return null;
  }
}

function PrimaryDetails({ ids, p }: { ids: SharedIds; p: Palette }) {
  return (
    <>
      <SideWing ids={ids} elegant />
      <SideWing ids={ids} elegant right />
      <g opacity="0.66">
        <path d="M171 47 C 190 58, 202 72, 205 92 C 202 111, 190 125, 171 135" stroke={p.filigree} strokeWidth="2.5" fill="none" />
        <path d="M829 47 C 810 58, 798 72, 795 92 C 798 111, 810 125, 829 135" stroke={p.filigree} strokeWidth="2.5" fill="none" />
        <path d="M500 50 C 523 62, 537 87, 532 114 C 509 108, 491 108, 468 114 C 463 87, 477 62, 500 50 Z" stroke={p.filigree} strokeWidth="2.4" fill="none" />
        <path d="M500 61 L 515 89 L 500 117 L 485 89 Z" stroke={p.filigree} strokeWidth="1.9" fill="none" />
        <path d="M500 69 L 509 89 L 500 109 L 491 89 Z" stroke={p.filigree} strokeWidth="1.4" fill="none" opacity="0.76" />
      </g>
    </>
  );
}

function SecondaryDetails({ ids, p }: { ids: SharedIds; p: Palette }) {
  return (
    <>
      <SideWing ids={ids} elegant />
      <SideWing ids={ids} elegant right />
      <g opacity="0.52">
        <path d="M159 53 C 176 64, 183 76, 182 89 C 183 102, 176 114, 159 126" stroke={p.filigree} strokeWidth="2.3" fill="none" />
        <path d="M841 53 C 824 64, 817 76, 818 89 C 817 102, 824 114, 841 126" stroke={p.filigree} strokeWidth="2.3" fill="none" />
        <path d="M500 56 L 510 77 L 531 87 L 510 97 L 500 118 L 490 97 L 469 87 L 490 77 Z" stroke={p.filigree} strokeWidth="1.8" fill="none" />
        <circle cx="500" cy="87" r="22" stroke={p.filigree} strokeWidth="1.4" fill="none" opacity="0.72" />
      </g>
    </>
  );
}

function GhostDetails({ ids, p }: { ids: SharedIds; p: Palette }) {
  return (
    <>
      <SideWing ids={ids} elegant />
      <SideWing ids={ids} elegant right />
      <g opacity="0.58">
        <path d="M171 52 C 185 62, 195 78, 195 89 C 195 100, 185 116, 171 126" stroke={p.filigree} strokeWidth="2.4" fill="none" />
        <path d="M829 52 C 815 62, 805 78, 805 89 C 805 100, 815 116, 829 126" stroke={p.filigree} strokeWidth="2.4" fill="none" />
        <path d="M445 89 H555" stroke={p.filigree} strokeWidth="1.5" />
        <path d="M500 39 V139" stroke={p.filigree} strokeWidth="1.5" opacity="0.62" />
        <path d="M500 58 L 509 79 L 531 89 L 509 99 L 500 120 L 491 99 L 469 89 L 491 79 Z" stroke={p.filigree} strokeWidth="1.8" fill="none" />
      </g>
    </>
  );
}

function DangerDetails({ ids, p }: { ids: SharedIds; p: Palette }) {
  return (
    <>
      <SideWing ids={ids} sharp />
      <SideWing ids={ids} right sharp />
      <g opacity="0.66">
        <path d="M166 47 C 180 65, 186 78, 186 89 C 186 100, 180 113, 166 131" stroke={p.filigree} strokeWidth="2.3" fill="none" />
        <path d="M834 47 C 820 65, 814 78, 814 89 C 814 100, 820 113, 834 131" stroke={p.filigree} strokeWidth="2.3" fill="none" />
        <path d="M500 53 L 522 70 L 514 89 L 522 108 L 500 125 L 478 108 L 486 89 L 478 70 Z" stroke={p.filigree} strokeWidth="2.2" fill="none" />
        <path d="M500 62 L 511 72 L 506 89 L 511 106 L 500 116 L 489 106 L 494 89 L 489 72 Z" stroke={p.filigree} strokeWidth="1.6" fill="none" opacity="0.78" />
      </g>
    </>
  );
}

function SuccessDetails({ ids, p }: { ids: SharedIds; p: Palette }) {
  return (
    <>
      <SideWing ids={ids} />
      <SideWing ids={ids} right />
      <g opacity="0.62">
        <path d="M168 49 C 182 62, 190 76, 192 89 C 190 102, 182 116, 168 129" stroke={p.filigree} strokeWidth="2.3" fill="none" />
        <path d="M832 49 C 818 62, 810 76, 808 89 C 810 102, 818 116, 832 129" stroke={p.filigree} strokeWidth="2.3" fill="none" />
        <circle cx="500" cy="89" r="28" stroke={p.filigree} strokeWidth="2" fill="none" />
        <path d="M482 89 L 495 102 L 519 78" stroke={p.filigree} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>
  );
}

function SubtleDetails({ ids, p }: { ids: SharedIds; p: Palette }) {
  return (
    <>
      <SideWing ids={ids} elegant />
      <SideWing ids={ids} elegant right />
      <g opacity="0.58">
        <path d="M160 53 C 174 66, 182 79, 182 89 C 182 99, 174 112, 160 125" stroke={p.filigree} strokeWidth="2.2" fill="none" />
        <path d="M840 53 C 826 66, 818 79, 818 89 C 818 99, 826 112, 840 125" stroke={p.filigree} strokeWidth="2.2" fill="none" />
        <path d="M500 57 L 510 78 L 532 89 L 510 100 L 500 121 L 490 100 L 468 89 L 490 78 Z" stroke={p.filigree} strokeWidth="1.9" fill="none" />
        <path d="M500 67 L 507 81 L 521 88 L 507 95 L 500 109 L 493 95 L 479 88 L 493 81 Z" stroke={p.filigree} strokeWidth="1.3" fill="none" opacity="0.76" />
      </g>
    </>
  );
}

function VariantDetails({ variant, ids, p }: { variant: Variant; ids: SharedIds; p: Palette }) {
  switch (variant) {
    case 'primary':
      return <PrimaryDetails ids={ids} p={p} />;
    case 'secondary':
      return <SecondaryDetails ids={ids} p={p} />;
    case 'ghost':
      return <GhostDetails ids={ids} p={p} />;
    case 'danger':
      return <DangerDetails ids={ids} p={p} />;
    case 'success':
      return <SuccessDetails ids={ids} p={p} />;
    case 'subtle':
      return <SubtleDetails ids={ids} p={p} />;
  }
}

export function ButtonChrome({ variant, disabled, className, style }: ButtonChromeProps) {
  const p = palettes[variant];
  const opacity = disabled ? 0.54 : 1;
  const uid = useId().replace(/:/g, '');
  const ids: SharedIds = {
    frame: `frame-${uid}`,
    frameAlt: `frame-alt-${uid}`,
    fill: `fill-${uid}`,
    fillInner: `fill-inner-${uid}`,
    gem: `gem-${uid}`,
    gemDark: `gem-dark-${uid}`,
    gemLight: `gem-light-${uid}`,
    gloss: `gloss-${uid}`,
    bevel: `bevel-${uid}`,
    glow: `glow-${uid}`,
    softShadow: `soft-shadow-${uid}`,
  };
  const shadow = `shadow-${uid}`;

  return (
    <svg className={className} style={style} viewBox="0 0 1000 182" preserveAspectRatio="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={ids.frame} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.frameLight} />
          <stop offset="34%" stopColor="#F1CC70" />
          <stop offset="60%" stopColor={p.frameMid} />
          <stop offset="100%" stopColor={p.frameDark} />
        </linearGradient>
        <linearGradient id={ids.frameAlt} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFF9E2" />
          <stop offset="45%" stopColor={p.frameMid} />
          <stop offset="100%" stopColor={p.frameDark} />
        </linearGradient>
        <linearGradient id={ids.fill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.fillTop} />
          <stop offset="48%" stopColor={p.fillMid} />
          <stop offset="100%" stopColor={p.fillBottom} />
        </linearGradient>
        <linearGradient id={ids.fillInner} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.innerTop} />
          <stop offset="100%" stopColor={p.innerBottom} />
        </linearGradient>
        <linearGradient id={ids.gem} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={p.gemLight} />
          <stop offset="24%" stopColor={p.gemMid} />
          <stop offset="100%" stopColor={p.gemDark} />
        </linearGradient>
        <linearGradient id={ids.gemDark} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={p.gemDark} />
          <stop offset="100%" stopColor="#15395E" />
        </linearGradient>
        <linearGradient id={ids.gemLight} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor={p.gemMid} />
        </linearGradient>
        <linearGradient id={ids.gloss} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.highlight} />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <linearGradient id={ids.bevel} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.78)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.03)" />
        </linearGradient>
        <radialGradient id={ids.glow} cx="50%" cy="45%" r="54%">
          <stop offset="0%" stopColor={p.glow} />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <linearGradient id={ids.softShadow} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.26)" />
        </linearGradient>
        <filter id={shadow} x="-12%" y="-25%" width="124%" height="180%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor={p.shadow} />
          <feDropShadow dx="0" dy="10" stdDeviation="4" floodColor="rgba(15,8,3,0.14)" />
        </filter>
      </defs>

      <g filter={`url(#${shadow})`} opacity={opacity}>
        <CoreShell p={p} ids={ids} />
        <VariantDetails variant={variant} ids={ids} p={p} />
      </g>
    </svg>
  );
}
