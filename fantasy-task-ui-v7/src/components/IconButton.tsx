import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type IconButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ReactNode;
  label?: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    label,
    variant = 'secondary',
    size = 'md',
    active = false,
    className,
    type = 'button',
    ...rest
  },
  ref,
) {
  const classes = [
    'ft-icon-button',
    `ft-icon-button--${variant}`,
    `ft-icon-button--${size}`,
    active ? 'is-active' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} type={type} className={classes} aria-label={label} title={label} {...rest}>
      <span className="ft-icon-button__frame" aria-hidden="true" />
      <span className="ft-icon-button__shine" aria-hidden="true" />
      <span className="ft-icon-button__glyph">{icon}</span>
    </button>
  );
});
