import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import originalSkin from '../assets/pixel-perfect/new-task-primary-original.png';
import transparentSkin from '../assets/pixel-perfect/new-task-primary-transparent.png';

export type ExactArtButtonSkin = 'original' | 'transparent';
export type ExactArtButtonSize = 'native' | 'xl' | 'lg' | 'md' | 'sm';

export interface ExactArtButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /**
   * Accessible label. The painted skin already contains the visual text “新建任务”.
   */
  label?: string;
  /**
   * original keeps the reference image 1:1; transparent removes the checkerboard background for app use.
   */
  skin?: ExactArtButtonSkin;
  size?: ExactArtButtonSize;
  /**
   * When true, keeps the artwork visually unchanged on hover; useful for strict screenshot comparison.
   */
  staticVisual?: boolean;
}

const ARTWORK_DIMENSIONS = {
  original: { width: 2048, height: 682 },
  transparent: { width: 1928, height: 585 },
};

export const ExactArtButton = forwardRef<HTMLButtonElement, ExactArtButtonProps>(function ExactArtButton(
  {
    label = '新建任务',
    skin = 'original',
    size = 'lg',
    staticVisual = false,
    className,
    style,
    type = 'button',
    ...rest
  },
  ref,
) {
  const art = skin === 'original' ? originalSkin : transparentSkin;
  const { width, height } = ARTWORK_DIMENSIONS[skin];
  const classes = [
    'ft-exact-art-button',
    `ft-exact-art-button--${size}`,
    `ft-exact-art-button--${skin}`,
    staticVisual ? 'is-static-visual' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      aria-label={label}
      title={label}
      style={{
        '--ft-art-src': `url(${art})`,
        '--ft-art-width': `${width}px`,
        '--ft-art-height': `${height}px`,
        '--ft-art-ratio': `${width} / ${height}`,
        ...style,
      } as CSSProperties}
      {...rest}
    >
      <span className="ft-exact-art-button__sr">{label}</span>
    </button>
  );
});
