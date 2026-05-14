import { clsx } from "clsx";
import { useId } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import type { LucideIcon } from "lucide-react";
import "./styles/genshin-ui-kit.css";

export type GiTone = "neutral" | "blue" | "teal" | "gold" | "violet" | "success" | "danger";
export type GiButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger";
export type GiButtonSize = "sm" | "md" | "lg";
export type GiFrameButtonVariant = "cream" | "teal" | "red" | "menu";

export function GiRoot({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("gk-kit-root", className)}>{children}</div>;
}

export function GiPageShell({
  actions,
  children,
  className,
  eyebrow,
  hero,
  metrics,
  subtitle,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  eyebrow?: ReactNode;
  hero?: ReactNode;
  metrics?: ReactNode;
  subtitle?: ReactNode;
  title: ReactNode;
}) {
  return (
    <section className={clsx("gk-kit-page", className)}>
      {hero && <div className="gk-kit-page__hero" aria-hidden="true">{hero}</div>}
      <header className="gk-kit-page__header">
        <div className="gk-kit-page__title-block">
          {eyebrow && <div className="gk-kit-page__eyebrow">{eyebrow}</div>}
          <h1 className="gk-kit-page__title">{title}</h1>
          {subtitle && <div className="gk-kit-page__subtitle">{subtitle}</div>}
        </div>
        {actions && <div className="gk-kit-page__actions">{actions}</div>}
      </header>
      {metrics && <div className="gk-kit-page__metrics">{metrics}</div>}
      <div className="gk-kit-page__body">{children}</div>
    </section>
  );
}

export function GiPanel({
  actions,
  children,
  className,
  subtitle,
  title,
  tone = "light",
}: {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  subtitle?: ReactNode;
  title?: ReactNode;
  tone?: "light" | "blue" | "transparent";
}) {
  return (
    <section className={clsx("gk-kit-panel", `gk-kit-panel-${tone}`, className)}>
      {(title || actions) && (
        <header className="gk-kit-panel__header">
          <div className="gk-kit-panel__title-block">
            {title && <h2 className="gk-kit-panel__title">{title}</h2>}
            {subtitle && <div className="gk-kit-panel__subtitle">{subtitle}</div>}
          </div>
          {actions && <div className="gk-kit-panel__actions">{actions}</div>}
        </header>
      )}
      <div className="gk-kit-panel__body">{children}</div>
    </section>
  );
}

export function GiButton({
  children,
  className,
  disabled,
  icon,
  loading,
  size = "md",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  loading?: boolean;
  size?: GiButtonSize;
  variant?: GiButtonVariant;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      className={clsx(
        "gk-kit-button",
        `gk-kit-button-${variant}`,
        `gk-kit-button-${size}`,
        loading && "is-loading",
        className,
      )}
    >
      <span className="gk-kit-button__cap" aria-hidden="true" />
      <span className="gk-kit-button__content">
        {icon && <span className="gk-kit-button__icon">{icon}</span>}
        {loading ? "处理中" : children}
      </span>
    </button>
  );
}

export function GiFrameButton({
  children,
  className,
  disabled,
  icon,
  loading,
  variant = "cream",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  loading?: boolean;
  variant?: GiFrameButtonVariant;
}) {
  const idPrefix = useId().replace(/:/g, "");

  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      className={clsx(
        "gk-frame-button",
        `gk-frame-button-${variant}`,
        icon && "has-icon",
        loading && "is-loading",
        className,
      )}
    >
      <GiFrameButtonArtwork idPrefix={idPrefix} variant={variant} />
      {icon && (
        <span className="gk-frame-button__socket">
          <span className="gk-frame-button__socket-core">{icon}</span>
        </span>
      )}
      <span className="gk-frame-button__label">{loading ? "处理中" : children}</span>
    </button>
  );
}

export function GiShopButton({
  children = "活动商店",
  className,
  disabled,
  loading,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
}) {
  const idPrefix = useId().replace(/:/g, "");

  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      className={clsx("gk-shop-button", loading && "is-loading", className)}
    >
      <GiShopButtonArtwork idPrefix={idPrefix} />
      <span className="gk-shop-button__socket" aria-hidden="true">
        <span className="gk-shop-button__socket-core">
          <GiShopGlyph />
        </span>
      </span>
      <span className="gk-shop-button__label">{loading ? "处理中" : children}</span>
    </button>
  );
}

function GiShopButtonArtwork({ idPrefix }: { idPrefix: string }) {
  const shellId = `${idPrefix}-shop-shell`;
  const fillId = `${idPrefix}-shop-fill`;
  const shadowId = `${idPrefix}-shop-shadow`;
  const patternId = `${idPrefix}-shop-pattern`;

  return (
    <svg
      aria-hidden="true"
      className="gk-shop-button__art"
      focusable="false"
      preserveAspectRatio="none"
      viewBox="0 0 367 106"
    >
      <defs>
        <filter id={shadowId} x="-8%" y="-22%" width="116%" height="150%">
          <feDropShadow dx="0" dy="3.2" stdDeviation="2.2" floodColor="#23384d" floodOpacity="0.28" />
        </filter>
        <linearGradient id={shellId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f8fbff" />
          <stop offset="0.42" stopColor="#dfe9f4" />
          <stop offset="1" stopColor="#93a7bc" />
        </linearGradient>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.48" stopColor="#f7fbff" />
          <stop offset="1" stopColor="#edf4fa" />
        </linearGradient>
        <pattern id={patternId} width="106" height="60" patternUnits="userSpaceOnUse">
          <path
            d="M10 44C28 15 58 13 78 39M31 48c9-19 24-26 45-20M97 17C76 43 50 42 33 18"
            fill="none"
            stroke="#c2ccda"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
        </pattern>
      </defs>

      <path
        d="M68 16H303C327 16 346 32 350 53C346 74 327 90 303 90H68C47 90 32 74 28 53C32 32 47 16 68 16Z"
        fill="#23384d"
        opacity="0.16"
      />
      <path
        d="M68 10H303C329 10 349 28 354 53C349 78 329 96 303 96H68C45 96 29 78 24 53C29 28 45 10 68 10Z"
        fill={`url(#${shellId})`}
        filter={`url(#${shadowId})`}
      />
      <path
        d="M71 15H300C323 15 342 31 347 53C342 75 323 91 300 91H71C50 91 35 75 30 53C35 31 50 15 71 15Z"
        fill="#f8fbff"
      />
      <path
        d="M75 22H296C316 22 332 35 337 53C332 71 316 84 296 84H75C57 84 43 71 38 53C43 35 57 22 75 22Z"
        fill={`url(#${fillId})`}
      />
      <path
        d="M81 27H292C309 27 323 38 327 53C323 68 309 79 292 79H81C66 79 53 68 49 53C53 38 66 27 81 27Z"
        fill="none"
        stroke="#9fb0c5"
        strokeWidth="1.7"
      />
      <path
        d="M81 27H292C309 27 323 38 327 53"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeWidth="2.2"
        opacity="0.92"
      />
      <path
        d="M75 22H296C316 22 332 35 337 53C332 71 316 84 296 84H75C57 84 43 71 38 53C43 35 57 22 75 22Z"
        fill={`url(#${patternId})`}
        opacity="0.42"
      />
      <path
        d="M304 31c-11 2-18 10-17 20c1 8 8 13 15 10c6-2 7-10 3-13c-3-2-8-1-10 2"
        fill="none"
        stroke="#b7c5d5"
        strokeLinecap="round"
        strokeWidth="2.2"
        opacity="0.72"
      />
      <path
        d="M316 43c-10 7-12 21-4 29M320 35c5 2 8 7 8 13"
        fill="none"
        stroke="#c9d3df"
        strokeLinecap="round"
        strokeWidth="2"
        opacity="0.66"
      />
      <path
        d="M34 34L50 22H82L71 31H52L38 41ZM34 72L50 84H82L71 75H52L38 65Z"
        fill="#edf4fb"
        stroke="#9eb0c5"
        strokeWidth="1.4"
        opacity="0.95"
      />
      <path
        d="M318 24h-21M318 82h-21"
        fill="none"
        stroke="#9fb2c8"
        strokeLinecap="round"
        strokeWidth="1.5"
        opacity="0.7"
      />
    </svg>
  );
}

function GiShopGlyph() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path
        d="M5.4 9.8h13.2v3.1H5.4zM6.7 14.1h10.6v5.6H6.7zM11 9.8h2v9.9h-2z"
        fill="currentColor"
      />
      <path
        d="M7.6 5.1c2.1-.2 3.7 1 4.4 4.2c-3.2-.4-4.7-1.6-4.4-4.2ZM16.4 5.1c-2.1-.2-3.7 1-4.4 4.2c3.2-.4 4.7-1.6 4.4-4.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function GiFrameButtonArtwork({
  idPrefix,
  variant,
}: {
  idPrefix: string;
  variant: GiFrameButtonVariant;
}) {
  const palette = frameButtonPalettes[variant];
  const geometry = frameButtonGeometry[variant];
  const outerGradientId = `${idPrefix}-outer`;
  const innerGradientId = `${idPrefix}-inner`;
  const rimGradientId = `${idPrefix}-rim`;
  const glowGradientId = `${idPrefix}-glow`;
  const patternId = `${idPrefix}-pattern`;
  const shadowId = `${idPrefix}-shadow`;

  return (
    <svg
      aria-hidden="true"
      className="gk-frame-button__art"
      focusable="false"
      preserveAspectRatio="none"
      viewBox="0 0 360 78"
    >
      <defs>
        <filter id={shadowId} x="-12%" y="-22%" width="124%" height="154%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.4" floodColor={palette.shadow} floodOpacity="0.42" />
        </filter>
        <linearGradient id={outerGradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={palette.outerTop} />
          <stop offset="0.48" stopColor={palette.outerMid} />
          <stop offset="1" stopColor={palette.outerBottom} />
        </linearGradient>
        <linearGradient id={innerGradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={palette.innerTop} />
          <stop offset="0.5" stopColor={palette.innerMid} />
          <stop offset="1" stopColor={palette.innerBottom} />
        </linearGradient>
        <linearGradient id={rimGradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={palette.rimDark} />
          <stop offset="0.14" stopColor={palette.rimLight} />
          <stop offset="0.5" stopColor={palette.rimMid} />
          <stop offset="0.86" stopColor={palette.rimLight} />
          <stop offset="1" stopColor={palette.rimDark} />
        </linearGradient>
        <radialGradient id={glowGradientId} cx="50%" cy="42%" r="68%">
          <stop offset="0" stopColor={palette.glow} stopOpacity="0.72" />
          <stop offset="0.5" stopColor={palette.glow} stopOpacity="0.24" />
          <stop offset="1" stopColor={palette.glow} stopOpacity="0" />
        </radialGradient>
        <pattern id={patternId} width="72" height="42" patternUnits="userSpaceOnUse">
          <path
            d="M4 28c14-22 33-22 47-1M21 34c4-12 13-17 27-15M66 11c-14 22-33 22-47 1"
            fill="none"
            stroke={palette.pattern}
            strokeLinecap="round"
            strokeWidth="1.6"
          />
          <circle cx="55" cy="13" r="2.2" fill={palette.pattern} opacity="0.7" />
        </pattern>
      </defs>

      <path d={geometry.shadow} fill={palette.shadow} opacity="0.22" />
      <path d={geometry.outer} fill={`url(#${outerGradientId})`} filter={`url(#${shadowId})`} />
      <path d={geometry.outerTrim} fill="none" stroke={`url(#${rimGradientId})`} strokeWidth="3.2" />
      <path d={geometry.inner} fill={`url(#${innerGradientId})`} />
      <path d={geometry.inner} fill={`url(#${glowGradientId})`} />
      <path d={geometry.innerTrim} fill="none" stroke={palette.innerStroke} strokeWidth="1.8" />
      <path d={geometry.inner} fill={`url(#${patternId})`} opacity={palette.patternOpacity} />
      {geometry.leftPlate && <path d={geometry.leftPlate} fill={palette.plate} opacity="0.72" />}
      {geometry.sideOrnaments.map((path, index) => (
        <path key={index} d={path} fill={palette.ornament} stroke={palette.ornamentStroke} strokeWidth="1.2" />
      ))}
      {geometry.accentOrnaments.map((path, index) => (
        <path key={index} d={path} fill={palette.accent} stroke={palette.accentStroke} strokeWidth="1.2" />
      ))}
      {geometry.softOrnaments.map((path, index) => (
        <path key={index} d={path} fill={palette.softOrnament} opacity="0.84" />
      ))}
      {geometry.lineOrnaments.map((path, index) => (
        <path key={index} d={path} fill="none" stroke={palette.line} strokeLinecap="round" strokeWidth="1.6" />
      ))}
      <path d={geometry.highlight} fill="none" stroke={palette.highlight} strokeLinecap="round" strokeWidth="2" opacity="0.78" />
    </svg>
  );
}

const frameButtonPalettes: Record<
  GiFrameButtonVariant,
  {
    accent: string;
    accentStroke: string;
    glow: string;
    highlight: string;
    innerBottom: string;
    innerMid: string;
    innerStroke: string;
    innerTop: string;
    line: string;
    ornament: string;
    ornamentStroke: string;
    outerBottom: string;
    outerMid: string;
    outerTop: string;
    pattern: string;
    patternOpacity: number;
    plate: string;
    rimDark: string;
    rimLight: string;
    rimMid: string;
    shadow: string;
    softOrnament: string;
  }
> = {
  cream: {
    accent: "#dba988",
    accentStroke: "#b9865f",
    glow: "#ffffff",
    highlight: "#fffdf0",
    innerBottom: "#edf1c8",
    innerMid: "#fbfbdf",
    innerStroke: "#6aa088",
    innerTop: "#fffde5",
    line: "#8eaa80",
    ornament: "#d8c17f",
    ornamentStroke: "#8a7648",
    outerBottom: "#8a744c",
    outerMid: "#c7ad70",
    outerTop: "#f4df99",
    pattern: "#a0ae78",
    patternOpacity: 0.18,
    plate: "#efe0a4",
    rimDark: "#5f5139",
    rimLight: "#fff1b7",
    rimMid: "#cdb474",
    shadow: "#23333a",
    softOrnament: "#ede6c9",
  },
  menu: {
    accent: "#d5c382",
    accentStroke: "#9f8a52",
    glow: "#ffffff",
    highlight: "#ffffff",
    innerBottom: "#eaf2fa",
    innerMid: "#f7fbff",
    innerStroke: "#9dafc3",
    innerTop: "#ffffff",
    line: "#9eb0c6",
    ornament: "#dbe4ec",
    ornamentStroke: "#7d93aa",
    outerBottom: "#8fa2b4",
    outerMid: "#c6d2de",
    outerTop: "#f4f8fb",
    pattern: "#a7b6c8",
    patternOpacity: 0.22,
    plate: "#dfe8f2",
    rimDark: "#71869c",
    rimLight: "#ffffff",
    rimMid: "#c4d0dc",
    shadow: "#293947",
    softOrnament: "#e8edf3",
  },
  red: {
    accent: "#69c7c2",
    accentStroke: "#356d70",
    glow: "#ffc8af",
    highlight: "#d49a82",
    innerBottom: "#833e3b",
    innerMid: "#a3524d",
    innerStroke: "#6e3634",
    innerTop: "#aa5e57",
    line: "#c98875",
    ornament: "#9a5650",
    ornamentStroke: "#6c3a37",
    outerBottom: "#6e3a38",
    outerMid: "#9b5752",
    outerTop: "#b66f67",
    pattern: "#d59782",
    patternOpacity: 0.2,
    plate: "#8d4b47",
    rimDark: "#5f3331",
    rimLight: "#cf8177",
    rimMid: "#8f4b47",
    shadow: "#2b1b1d",
    softOrnament: "#bd6c5b",
  },
  teal: {
    accent: "#68cbc6",
    accentStroke: "#2f7779",
    glow: "#9cf9ff",
    highlight: "#b9fbff",
    innerBottom: "#067181",
    innerMid: "#128aa0",
    innerStroke: "#1fa9b7",
    innerTop: "#1c99ad",
    line: "#75dae0",
    ornament: "#e1c984",
    ornamentStroke: "#8a7648",
    outerBottom: "#8a744c",
    outerMid: "#d0b978",
    outerTop: "#f4df99",
    pattern: "#9af1f7",
    patternOpacity: 0.18,
    plate: "#e7cf87",
    rimDark: "#66563b",
    rimLight: "#fff0b4",
    rimMid: "#d7bf7c",
    shadow: "#1e3d48",
    softOrnament: "#39aeb8",
  },
};

const frameButtonGeometry: Record<
  GiFrameButtonVariant,
  {
    accentOrnaments: string[];
    highlight: string;
    inner: string;
    innerTrim: string;
    leftPlate?: string;
    lineOrnaments: string[];
    outer: string;
    outerTrim: string;
    shadow: string;
    sideOrnaments: string[];
    softOrnaments: string[];
  }
> = {
  cream: {
    accentOrnaments: [
      "M31 35c5-8 12-8 17 0c-5 8-12 8-17 0Z",
      "M31 43c5 8 12 8 17 0c-5-8-12-8-17 0Z",
      "M329 35c-5-8-12-8-17 0c5 8 12 8 17 0Z",
      "M329 43c-5 8-12 8-17 0c5-8 12-8 17 0Z",
    ],
    highlight: "M77 14H283",
    inner: "M55 11H305C324 11 338 22 340 39C338 56 324 67 305 67H55C36 67 22 56 20 39C22 22 36 11 55 11Z",
    innerTrim: "M61 17H299C316 17 328 26 330 39C328 52 316 61 299 61H61C44 61 32 52 30 39C32 26 44 17 61 17Z",
    lineOrnaments: ["M41 21c-10 9-10 27 0 36", "M319 21c10 9 10 27 0 36", "M68 18h36M256 18h36"],
    outer: "M42 3H318L352 39L318 75H42L8 39L42 3Z",
    outerTrim: "M46 8H314L345 39L314 70H46L15 39L46 8Z",
    shadow: "M43 8H320L355 43L316 78H41L5 43L43 8Z",
    sideOrnaments: [
      "M20 39l18-23l7 7l-14 16l14 16l-7 7z",
      "M340 39l-18-23l-7 7l14 16l-14 16l7 7z",
      "M41 8h22l-7 9h-25z",
      "M297 70h22l10-9h-25z",
    ],
    softOrnaments: ["M96 39c20-24 48-24 68 0c-20 24-48 24-68 0Z", "M196 39c20-24 48-24 68 0c-20 24-48 24-68 0Z"],
  },
  menu: {
    accentOrnaments: ["M334 23c-9 6-9 26 0 32c-4-10-4-22 0-32Z", "M53 19l-16 20l16 20"],
    highlight: "M79 12H285",
    inner: "M58 8H306C326 8 342 20 345 39C342 58 326 70 306 70H58C38 70 22 58 19 39C22 20 38 8 58 8Z",
    innerTrim: "M64 14H302C318 14 331 24 334 39C331 54 318 64 302 64H64C48 64 35 54 32 39C35 24 48 14 64 14Z",
    leftPlate: "M22 39C22 18 38 5 58 5H88L75 73H58C38 73 22 60 22 39Z",
    lineOrnaments: ["M69 18c-12 7-18 14-18 21s6 14 18 21", "M301 18c12 7 18 14 18 21s-6 14-18 21"],
    outer: "M45 2H318C340 2 357 17 359 39C357 61 340 76 318 76H45C22 76 4 61 2 39C4 17 22 2 45 2Z",
    outerTrim: "M49 7H314C334 7 349 20 351 39C349 58 334 71 314 71H49C29 71 14 58 12 39C14 20 29 7 49 7Z",
    shadow: "M44 7H320C344 7 360 22 360 43C358 64 341 78 318 78H44C19 78 1 63 0 43C2 22 19 7 44 7Z",
    sideOrnaments: [
      "M21 18h28l-12 9h-22z",
      "M21 60h28l-12-9h-22z",
      "M339 18h-28l12 9h22z",
      "M339 60h-28l12-9h22z",
    ],
    softOrnaments: ["M89 39c17-18 43-18 60 0c-17 18-43 18-60 0Z", "M211 39c17-18 43-18 60 0c-17 18-43 18-60 0Z"],
  },
  red: {
    accentOrnaments: [
      "M29 39a7 7 0 1 0 14 0a7 7 0 1 0-14 0",
      "M317 39a7 7 0 1 0 14 0a7 7 0 1 0-14 0",
    ],
    highlight: "M69 13H291",
    inner: "M50 11H310C327 11 341 23 344 39C341 55 327 67 310 67H50C33 67 19 55 16 39C19 23 33 11 50 11Z",
    innerTrim: "M59 18H301C317 18 329 28 332 39C329 50 317 60 301 60H59C43 60 31 50 28 39C31 28 43 18 59 18Z",
    lineOrnaments: ["M45 38c22-16 38-15 50 0M265 38c22-16 38-15 50 0", "M72 38h3M84 38h3M273 38h3M285 38h3"],
    outer: "M44 4H316C337 4 353 20 358 39C353 58 337 74 316 74H44C23 74 7 58 2 39C7 20 23 4 44 4Z",
    outerTrim: "M49 9H311C330 9 344 22 349 39C344 56 330 69 311 69H49C30 69 16 56 11 39C16 22 30 9 49 9Z",
    shadow: "M42 8H317C341 8 359 24 360 43C356 62 339 78 315 78H42C18 78 1 62 0 43C1 24 18 8 42 8Z",
    sideOrnaments: [
      "M17 39l22-28l22 8l-14 20l14 20l-22 8z",
      "M343 39l-22-28l-22 8l14 20l-14 20l22 8z",
      "M39 24c18-13 33-12 45 3c-19-3-34 0-45 11Z",
      "M321 24c-18-13-33-12-45 3c19-3 34 0 45 11Z",
    ],
    softOrnaments: ["M62 39c19-13 47-13 66 0c-19 13-47 13-66 0Z", "M232 39c19-13 47-13 66 0c-19 13-47 13-66 0Z"],
  },
  teal: {
    accentOrnaments: [
      "M36 39a6 6 0 1 0 12 0a6 6 0 1 0-12 0",
      "M312 39a6 6 0 1 0 12 0a6 6 0 1 0-12 0",
      "M46 22l15 17l-15 17l-10-17z",
      "M314 22l-15 17l15 17l10-17z",
    ],
    highlight: "M78 13H282",
    inner: "M58 10H302L332 39L302 68H58L28 39L58 10Z",
    innerTrim: "M65 17H295L321 39L295 61H65L42 39L65 17Z",
    lineOrnaments: ["M55 24l15 15l-15 15", "M305 24l-15 15l15 15", "M82 17h42M236 17h42"],
    outer: "M39 3H318L352 18L341 39L352 60L318 75H39L8 39L39 3Z",
    outerTrim: "M45 9H312L342 22L332 39L342 56L312 69H45L18 39L45 9Z",
    shadow: "M38 8H321L357 22L347 43L357 64L318 78H36L0 43L38 8Z",
    sideOrnaments: [
      "M19 39l23-29l8 9l-15 20l15 20l-8 9z",
      "M341 39l-23-29l-8 9l15 20l-15 20l8 9z",
      "M29 18l15-14h22l-14 14z",
      "M294 60l15 14h22l-14-14z",
    ],
    softOrnaments: ["M75 39c22-14 52-14 74 0c-22 14-52 14-74 0Z", "M211 39c22-14 52-14 74 0c-22 14-52 14-74 0Z"],
  },
};

export function GiIconButton({
  className,
  icon: Icon,
  label,
  tone = "light",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  tone?: "light" | "blue";
}) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={clsx("gk-kit-icon-button", `gk-kit-icon-button-${tone}`, className)}
    >
      <Icon className="gk-kit-icon-button__icon" />
    </button>
  );
}

export function GiBadge({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: GiTone;
}) {
  return <span className={clsx("gk-kit-badge", `gk-kit-badge-${tone}`, className)}>{children}</span>;
}

export function GiRewardChip({
  icon,
  label,
  tone = "blue",
  value,
}: {
  icon?: ReactNode;
  label?: ReactNode;
  tone?: "blue" | "gold" | "violet" | "teal";
  value: ReactNode;
}) {
  return (
    <span className={clsx("gk-kit-reward", `gk-kit-reward-${tone}`)}>
      {icon && <span className="gk-kit-reward__icon">{icon}</span>}
      <span className="gk-kit-reward__value">{value}</span>
      {label && <span className="gk-kit-reward__label">{label}</span>}
    </span>
  );
}

export function GiMetric({
  icon: Icon,
  label,
  tone = "blue",
  value,
}: {
  icon?: LucideIcon;
  label: ReactNode;
  tone?: "blue" | "teal" | "gold";
  value: ReactNode;
}) {
  return (
    <div className={clsx("gk-kit-metric", `gk-kit-metric-${tone}`)}>
      {Icon && (
        <span className="gk-kit-metric__icon" aria-hidden="true">
          <Icon className="gk-kit-metric__svg" />
        </span>
      )}
      <div className="gk-kit-metric__text">
        <div className="gk-kit-metric__label">{label}</div>
        <div className="gk-kit-metric__value">{value}</div>
      </div>
    </div>
  );
}

export function GiField({ children, label }: { children: ReactNode; label: ReactNode }) {
  return (
    <label className="gk-kit-field">
      <span className="gk-kit-field__label">{label}</span>
      {children}
    </label>
  );
}

export function GiInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx("gk-kit-input", className)} />;
}

export function GiSelect({ children, className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={clsx("gk-kit-select", className)}>
      {children}
    </select>
  );
}

export function GiFilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("gk-kit-filter-bar", className)}>{children}</div>;
}

export function GiTabs<TValue extends string>({
  items,
  onChange,
  value,
}: {
  items: readonly { label: ReactNode; value: TValue }[];
  onChange: (value: TValue) => void;
  value: TValue;
}) {
  return (
    <div className="gk-kit-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          aria-selected={item.value === value}
          className={clsx("gk-kit-tab", item.value === value && "is-active")}
          role="tab"
          type="button"
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function GiSectionTitle({
  action,
  children,
  icon: Icon,
}: {
  action?: ReactNode;
  children: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="gk-kit-section-title">
      <div className="gk-kit-section-title__main">
        {Icon && <Icon className="gk-kit-section-title__icon" />}
        <span>{children}</span>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function GiQuestStrip({
  action,
  active,
  icon,
  meta,
  onClick,
  rewards,
  status,
  subtitle,
  title,
}: {
  action?: ReactNode;
  active?: boolean;
  icon?: ReactNode;
  meta?: ReactNode;
  onClick?: () => void;
  rewards?: ReactNode;
  status?: ReactNode;
  subtitle?: ReactNode;
  title: ReactNode;
}) {
  const content = (
    <>
      <div className="gk-kit-strip__icon" aria-hidden="true">{icon}</div>
      <div className="gk-kit-strip__main">
        <h3 className="gk-kit-strip__title">{title}</h3>
        {subtitle && <div className="gk-kit-strip__subtitle">{subtitle}</div>}
        {meta && <div className="gk-kit-strip__meta">{meta}</div>}
      </div>
      {rewards && <div className="gk-kit-strip__rewards">{rewards}</div>}
      {status && <div className="gk-kit-strip__status">{status}</div>}
      {action && <div className="gk-kit-strip__action">{action}</div>}
    </>
  );

  if (onClick) {
    return (
      <button className={clsx("gk-kit-strip", active && "is-active", "is-clickable")} type="button" onClick={onClick}>
        {content}
      </button>
    );
  }

  return <article className={clsx("gk-kit-strip", active && "is-active")}>{content}</article>;
}

export function GiBountyCard({
  action,
  deadline,
  difficulty,
  objective,
  points,
  proposer,
  status,
  title,
}: {
  action?: ReactNode;
  deadline?: ReactNode;
  difficulty?: ReactNode;
  objective: ReactNode;
  points: ReactNode;
  proposer?: ReactNode;
  status?: ReactNode;
  title: ReactNode;
}) {
  return (
    <article className="gk-kit-bounty-card">
      <header className="gk-kit-bounty-card__header">
        <div className="gk-kit-bounty-card__badges">
          {difficulty && <GiBadge tone="blue">{difficulty}</GiBadge>}
          <GiBadge tone="gold">{points}</GiBadge>
        </div>
        {status && <div>{status}</div>}
      </header>
      <div className="gk-kit-bounty-card__body">
        <h3 className="gk-kit-bounty-card__title">{title}</h3>
        <div className="gk-kit-bounty-card__objective">{objective}</div>
        {proposer && <div className="gk-kit-bounty-card__proposer">{proposer}</div>}
      </div>
      <footer className="gk-kit-bounty-card__footer">
        {deadline && <div className="gk-kit-bounty-card__deadline">{deadline}</div>}
        {action && <div className="gk-kit-bounty-card__action">{action}</div>}
      </footer>
    </article>
  );
}

export function GiProgressRail({
  items,
}: {
  items: { active?: boolean; icon?: ReactNode; label: ReactNode; locked?: boolean }[];
}) {
  return (
    <div className="gk-kit-progress-rail">
      {items.map((item, index) => (
        <div key={index} className={clsx("gk-kit-progress-node", item.active && "is-active", item.locked && "is-locked")}>
          <span className="gk-kit-progress-node__icon">{item.icon}</span>
          <span className="gk-kit-progress-node__label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function GiModalFrame({
  children,
  footer,
  title,
}: {
  children: ReactNode;
  footer?: ReactNode;
  title: ReactNode;
}) {
  return (
    <section className="gk-kit-modal-frame">
      <header className="gk-kit-modal-frame__header">
        <h2>{title}</h2>
      </header>
      <div className="gk-kit-modal-frame__body">{children}</div>
      {footer && <footer className="gk-kit-modal-frame__footer">{footer}</footer>}
    </section>
  );
}

export function GiEmptyState({ action, description, title }: { action?: ReactNode; description: ReactNode; title: ReactNode }) {
  return (
    <div className="gk-kit-empty">
      <div className="gk-kit-empty__mark" aria-hidden="true">◇</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
