import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import heroNewTaskArt from '../assets/hero-new-task-exact.png';

export type ExactHeroButtonSize = 'sm' | 'md' | 'lg' | 'native';

export interface ExactHeroButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible label. The visual text is baked into the supplied art skin for pixel-matched rendering. */
  label?: string;
  size?: ExactHeroButtonSize;
  block?: boolean;
}

export const ExactHeroButton = forwardRef<HTMLButtonElement, ExactHeroButtonProps>(function ExactHeroButton(
  { label = '新建任务', size = 'md', block = false, className, type = 'button', style, ...rest },
  ref,
) {
  const classes = [
    'ft-exact-hero-button',
    `ft-exact-hero-button--${size}`,
    block ? 'ft-exact-hero-button--block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      aria-label={label}
      title={label}
      style={{
        '--ft-exact-hero-art': `url(${heroNewTaskArt})`,
        ...style,
      } as CSSProperties}
      {...rest}
    >
      <span className="ft-exact-hero-button__skin" aria-hidden="true" />
      <span className="ft-exact-hero-button__hit-label">{label}</span>
    </button>
  );
});
