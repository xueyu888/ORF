import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import referenceHeroButton from '../assets/reference-hero-button.png';

export type ReferenceHeroButtonRenderMode = 'asset' | 'vector';

export interface ReferenceHeroButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  renderMode?: ReferenceHeroButtonRenderMode;
  width?: CSSProperties['width'];
}

function Gem({ x, y, size = 44, id }: { x: number; y: number; size?: number; id: string }) {
  const r = size / 2;
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={`M0 ${-r} L${r} 0 L0 ${r} L${-r} 0 Z`} fill={`url(#gold-${id})`} />
      <path d={`M0 ${-r * 0.58} L${r * 0.58} 0 L0 ${r * 0.58} L${-r * 0.58} 0 Z`} fill={`url(#blueGem-${id})`} stroke="#ffefb6" strokeWidth="2" />
      <path d={`M0 ${-r * 0.42} L${r * 0.22} 0 L0 ${r * 0.42} L${-r * 0.22} 0 Z`} fill="rgba(255,255,255,.62)" />
    </g>
  );
}

function SideOrnament({ right = false, id }: { right?: boolean; id: string }) {
  const t = right ? 'translate(2048 0) scale(-1 1)' : undefined;
  return (
    <g transform={t}>
      <path d="M74 342 C114 314 130 250 159 211 C181 181 214 163 255 161" stroke={`url(#gold-${id})`} strokeWidth="18" fill="none" strokeLinecap="round" />
      <path d="M75 342 C114 378 129 441 166 486 C190 514 227 528 274 525" stroke={`url(#gold-${id})`} strokeWidth="18" fill="none" strokeLinecap="round" />
      <path d="M163 198 C185 191 207 180 230 160 C222 190 200 215 166 231" fill={`url(#gold-${id})`} stroke="#77501f" strokeWidth="3" />
      <path d="M174 244 C203 235 226 220 248 190 C244 229 219 254 184 268" fill={`url(#gold-${id})`} stroke="#77501f" strokeWidth="3" />
      <path d="M170 481 C198 488 226 505 249 538 C245 496 219 470 183 457" fill={`url(#gold-${id})`} stroke="#77501f" strokeWidth="3" />
      <path d="M154 435 C187 441 218 461 240 498 C234 454 204 428 162 420" fill={`url(#gold-${id})`} stroke="#77501f" strokeWidth="3" />
      <path d="M128 342 L180 283 L232 342 L180 401 Z" fill={`url(#gold-${id})`} stroke="#6e461a" strokeWidth="5" />
      <path d="M180 302 L217 342 L180 382 L143 342 Z" fill={`url(#blueGem-${id})`} stroke="#ffefb5" strokeWidth="3" />
      <path d="M180 316 L202 342 L180 366 L158 342 Z" fill="#071f47" opacity=".92" />
      <path d="M180 320 L194 342 L180 358 L167 342 Z" fill="rgba(255,255,255,.55)" />
    </g>
  );
}

function CompassEmblem({ id }: { id: string }) {
  return (
    <g transform="translate(530 342)">
      <circle cx="0" cy="0" r="78" fill="none" stroke={`url(#gold-${id})`} strokeWidth="8" opacity=".95" />
      <circle cx="0" cy="0" r="52" fill="rgba(7,24,49,.12)" stroke="#f5d890" strokeWidth="3" opacity=".65" />
      <path d="M0 -128 L28 -28 L128 0 L28 28 L0 128 L-28 28 L-128 0 L-28 -28 Z" fill={`url(#gold-${id})`} stroke="#6e461b" strokeWidth="4" />
      <path d="M0 -88 L18 -18 L88 0 L18 18 L0 88 L-18 18 L-88 0 L-18 -18 Z" fill={`url(#paleGold-${id})`} opacity=".98" />
      <path d="M0 -54 L16 -16 L54 0 L16 16 L0 54 L-16 16 L-54 0 L-16 -16 Z" fill="rgba(255,255,255,.55)" />
      <path d="M0 -25 L25 0 L0 25 L-25 0 Z" fill={`url(#blueGem-${id})`} stroke="#ffecac" strokeWidth="3" />
      <circle cx="0" cy="0" r="8" fill="#e6ffff" opacity=".9" />
    </g>
  );
}

function ReferenceHeroVector({ id }: { id: string }) {
  return (
    <svg className="ft-reference-hero__vector" viewBox="0 0 2048 682" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`gold-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff2bc" />
          <stop offset=".28" stopColor="#e8be68" />
          <stop offset=".56" stopColor="#b77a31" />
          <stop offset="1" stopColor="#5e3a16" />
        </linearGradient>
        <linearGradient id={`paleGold-${id}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fff8dc" />
          <stop offset=".42" stopColor="#fee8a9" />
          <stop offset="1" stopColor="#b06e2b" />
        </linearGradient>
        <linearGradient id={`blueFill-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3f7ec5" />
          <stop offset=".32" stopColor="#225b98" />
          <stop offset=".72" stopColor="#12345f" />
          <stop offset="1" stopColor="#091f3f" />
        </linearGradient>
        <linearGradient id={`blueGem-${id}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#f2ffff" />
          <stop offset=".28" stopColor="#34b6ff" />
          <stop offset="1" stopColor="#0c45c2" />
        </linearGradient>
        <radialGradient id={`centerGlow-${id}`} cx="50%" cy="43%" r="62%">
          <stop offset="0" stopColor="rgba(255,255,255,.14)" />
          <stop offset=".45" stopColor="rgba(255,255,255,.03)" />
          <stop offset="1" stopColor="rgba(0,0,0,.12)" />
        </radialGradient>
        <radialGradient id={`texture-${id}`} cx="50%" cy="42%" r="65%">
          <stop offset="0" stopColor="rgba(145,188,235,.16)" />
          <stop offset=".5" stopColor="rgba(35,82,135,.08)" />
          <stop offset="1" stopColor="rgba(0,0,0,.18)" />
        </radialGradient>
        <filter id={`softShadow-${id}`} x="-10%" y="-20%" width="120%" height="150%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="rgba(14,8,3,.38)" />
          <feDropShadow dx="0" dy="22" stdDeviation="10" floodColor="rgba(14,8,3,.2)" />
        </filter>
        <filter id={`innerBlur-${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
        <clipPath id={`mainClip-${id}`}>
          <path d="M286 82 H1762 C1840 82 1895 136 1900 218 C1916 233 1930 249 1935 272 C1952 285 1952 315 1935 329 C1931 362 1911 384 1900 398 C1894 480 1840 535 1762 535 H286 C208 535 153 480 148 398 C133 383 116 359 112 329 C94 314 94 285 112 272 C116 249 132 232 148 218 C154 136 208 82 286 82 Z" />
        </clipPath>
      </defs>

      <g filter={`url(#softShadow-${id})`}>
        <path d="M286 73 H1762 C1846 73 1907 130 1914 215 C1937 238 1950 263 1951 285 C1970 301 1970 319 1951 335 C1949 367 1928 394 1914 411 C1906 495 1846 545 1762 545 H286 C202 545 141 495 133 411 C119 394 99 367 97 335 C78 319 78 301 97 285 C98 263 111 238 133 215 C141 130 202 73 286 73 Z" fill={`url(#gold-${id})`} />
        <path d="M296 91 H1752 C1828 91 1880 142 1888 226 C1905 243 1918 262 1923 286 C1935 297 1935 323 1923 334 C1919 363 1904 383 1888 401 C1880 483 1828 525 1752 525 H296 C220 525 168 483 160 401 C144 383 129 363 125 334 C113 323 113 297 125 286 C130 262 143 243 160 226 C168 142 220 91 296 91 Z" fill="#6b4218" opacity=".95" />
        <path d="M300 104 H1748 C1814 104 1864 150 1869 232 C1880 244 1887 259 1890 277 C1897 287 1897 333 1890 343 C1887 361 1880 376 1869 388 C1864 469 1814 511 1748 511 H300 C234 511 184 469 179 388 C168 376 161 361 158 343 C151 333 151 287 158 277 C161 259 168 244 179 232 C184 150 234 104 300 104 Z" fill={`url(#blueFill-${id})`} stroke="#ffdf87" strokeWidth="6" />
        <path d="M330 126 H1718 C1778 126 1829 169 1835 238 C1849 250 1856 269 1858 294 C1863 303 1863 316 1858 325 C1855 350 1848 367 1835 382 C1829 452 1778 489 1718 489 H330 C270 489 219 452 213 382 C200 367 193 350 190 325 C185 316 185 303 190 294 C193 269 200 250 213 238 C219 169 270 126 330 126 Z" fill="none" stroke="#0c1d37" strokeWidth="18" opacity=".92" />
        <path d="M330 136 H1718 C1773 136 1818 175 1825 242 C1842 260 1848 280 1848 309 C1848 338 1842 358 1825 377 C1818 443 1773 479 1718 479 H330 C275 479 230 443 223 377 C206 358 200 338 200 309 C200 280 206 260 223 242 C230 175 275 136 330 136 Z" fill="none" stroke="#f5ca6d" strokeWidth="5" opacity=".9" />
        <path d="M357 150 H1688 C1735 150 1775 183 1782 246 C1799 262 1803 287 1803 309 C1803 332 1798 357 1782 373 C1775 433 1735 465 1688 465 H357 C310 465 270 433 263 373 C247 357 242 332 242 309 C242 287 246 262 263 246 C270 183 310 150 357 150 Z" fill="rgba(255,255,255,.04)" stroke="rgba(255,231,164,.65)" strokeWidth="2" />
        <path d="M300 104 H1748 C1814 104 1864 150 1869 232 C1880 244 1887 259 1890 277 C1897 287 1897 333 1890 343 C1887 361 1880 376 1869 388 C1864 469 1814 511 1748 511 H300 C234 511 184 469 179 388 C168 376 161 361 158 343 C151 333 151 287 158 277 C161 259 168 244 179 232 C184 150 234 104 300 104 Z" fill={`url(#centerGlow-${id})`} />
        <g clipPath={`url(#mainClip-${id})`} opacity=".85">
          <path d="M342 130 C670 170 1328 170 1665 132 L1665 165 C1329 190 672 190 342 165 Z" fill="rgba(255,255,255,.16)" />
          <path d="M340 405 C666 456 1330 456 1668 408 L1668 475 C1328 492 672 492 340 475 Z" fill="rgba(0,0,0,.20)" />
          <rect x="260" y="118" width="1520" height="430" fill={`url(#texture-${id})`} />
        </g>

        <g opacity=".24" transform="translate(1024 310)">
          <circle r="126" fill="none" stroke="#9ec9ee" strokeWidth="7" />
          <path d="M0 -205 L34 -34 L205 0 L34 34 L0 205 L-34 34 L-205 0 L-34 -34 Z" fill="none" stroke="#9ec9ee" strokeWidth="6" />
          <path d="M0 -145 L23 -23 L145 0 L23 23 L0 145 L-23 23 L-145 0 L-23 -23 Z" fill="none" stroke="#9ec9ee" strokeWidth="3" />
        </g>

        <SideOrnament id={id} />
        <SideOrnament id={id} right />
        <Gem x={1024} y={85} size={66} id={id} />
        <Gem x={1024} y={528} size={56} id={id} />
        <CompassEmblem id={id} />
      </g>
    </svg>
  );
}

export const ReferenceHeroButton = forwardRef<HTMLButtonElement, ReferenceHeroButtonProps>(function ReferenceHeroButton(
  {
    label = '新建任务',
    renderMode = 'asset',
    width = 'min(100%, 1024px)',
    className,
    style,
    type = 'button',
    disabled,
    ...rest
  },
  ref,
) {
  const id = 'refHero';
  const classes = ['ft-reference-hero', `ft-reference-hero--${renderMode}`, className ?? ''].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled}
      aria-label={label}
      style={{ ...style, width }}
      {...rest}
    >
      {renderMode === 'asset' ? (
        <img className="ft-reference-hero__asset" src={referenceHeroButton} alt="" aria-hidden="true" draggable={false} />
      ) : (
        <ReferenceHeroVector id={id} />
      )}
      {renderMode === 'vector' ? <span className="ft-reference-hero__label">{label}</span> : <span className="ft-reference-hero__sr">{label}</span>}
    </button>
  );
});
