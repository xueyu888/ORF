import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type FloatingActionButtonVariant = 'primary' | 'success' | 'danger' | 'secondary';
export type FloatingActionButtonSize = 'md' | 'lg';

export interface FloatingActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ReactNode;
  label?: ReactNode;
  variant?: FloatingActionButtonVariant;
  size?: FloatingActionButtonSize;
  extended?: boolean;
}

export const FloatingActionButton = forwardRef<HTMLButtonElement, FloatingActionButtonProps>(function FloatingActionButton(
  { icon, label, variant = 'primary', size = 'md', extended = false, className, type = 'button', ...rest },
  ref,
) {
  const classes = [
    'ft-fab',
    `ft-fab--${variant}`,
    `ft-fab--${size}`,
    extended || label ? 'ft-fab--extended' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} type={type} className={classes} aria-label={typeof label === 'string' ? label : rest['aria-label']} {...rest}>
      <span className="ft-fab__frame" aria-hidden="true" />
      <span className="ft-fab__runes" aria-hidden="true" />
      <span className="ft-fab__shine" aria-hidden="true" />
      <span className="ft-fab__icon">{icon}</span>
      {label && extended ? <span className="ft-fab__label">{label}</span> : null}
    </button>
  );
});
