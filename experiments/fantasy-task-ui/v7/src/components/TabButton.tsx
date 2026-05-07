import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type TabButtonVariant = 'primary' | 'ghost' | 'subtle';

export interface TabButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  icon?: ReactNode;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  badge?: ReactNode;
  variant?: TabButtonVariant;
}

export const TabButton = forwardRef<HTMLButtonElement, TabButtonProps>(function TabButton(
  { active = false, icon, leadingIcon, trailingIcon, badge, variant = 'ghost', className, children, type = 'button', ...rest },
  ref,
) {
  const resolvedLeadingIcon = leadingIcon ?? icon;
  const classes = ['ft-tab-button', `ft-tab-button--${variant}`, active ? 'is-active' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} type={type} role="tab" aria-selected={active} className={classes} {...rest}>
      <span className="ft-tab-button__frame" aria-hidden="true" />
      <span className="ft-tab-button__content">
        {resolvedLeadingIcon ? <span className="ft-tab-button__icon">{resolvedLeadingIcon}</span> : null}
        <span className="ft-tab-button__label">{children}</span>
        {trailingIcon ? <span className="ft-tab-button__icon">{trailingIcon}</span> : null}
        {badge ? <span className="ft-tab-button__badge">{badge}</span> : null}
      </span>
    </button>
  );
});
