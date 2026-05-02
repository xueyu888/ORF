import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ToolbarButtonVariant = 'secondary' | 'ghost' | 'subtle';

export interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  variant?: ToolbarButtonVariant;
  active?: boolean;
}

export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(function ToolbarButton(
  {
    leadingIcon,
    trailingIcon,
    variant = 'ghost',
    active = false,
    className,
    type = 'button',
    children,
    ...rest
  },
  ref,
) {
  const classes = [
    'ft-toolbar-button',
    `ft-toolbar-button--${variant}`,
    active ? 'is-active' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} type={type} className={classes} {...rest}>
      <span className="ft-toolbar-button__frame" aria-hidden="true" />
      <span className="ft-toolbar-button__shine" aria-hidden="true" />
      <span className="ft-toolbar-button__content">
        {leadingIcon ? <span className="ft-toolbar-button__icon">{leadingIcon}</span> : null}
        <span className="ft-toolbar-button__label">{children}</span>
        {trailingIcon ? <span className="ft-toolbar-button__icon">{trailingIcon}</span> : null}
      </span>
    </button>
  );
});
