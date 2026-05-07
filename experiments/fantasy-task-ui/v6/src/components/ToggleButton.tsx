import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ToggleButtonVariant = 'primary' | 'secondary' | 'success';

export interface ToggleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  icon?: ReactNode;
  leadingIcon?: ReactNode;
  variant?: ToggleButtonVariant;
}

export const ToggleButton = forwardRef<HTMLButtonElement, ToggleButtonProps>(function ToggleButton(
  { pressed = false, icon, leadingIcon, variant = 'secondary', className, children, type = 'button', ...rest },
  ref,
) {
  const classes = ['ft-toggle-button', `ft-toggle-button--${variant}`, pressed ? 'is-pressed' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  const resolvedIcon = icon ?? leadingIcon;

  return (
    <button ref={ref} type={type} className={classes} aria-pressed={pressed} {...rest}>
      <span className="ft-toggle-button__frame" aria-hidden="true" />
      <span className="ft-toggle-button__shine" aria-hidden="true" />
      <span className="ft-toggle-button__content">
        {resolvedIcon ? <span className="ft-toggle-button__icon">{resolvedIcon}</span> : null}
        <span className="ft-toggle-button__label">{children}</span>
      </span>
    </button>
  );
});
