import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ButtonChrome } from './ButtonChrome';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    leadingIcon,
    trailingIcon,
    loading = false,
    block = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const classes = [
    'ft-button',
    `ft-button--${variant}`,
    `ft-button--${size}`,
    block ? 'ft-button--block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      data-variant={variant}
      {...rest}
    >
      <ButtonChrome variant={variant} disabled={isDisabled} className="ft-button__chrome" />
      <span className="ft-button__shine" aria-hidden="true" />
      <span className="ft-button__content">
        {loading ? <span className="ft-button__spinner" aria-hidden="true" /> : null}
        {!loading && leadingIcon ? <span className="ft-button__icon ft-button__icon--leading">{leadingIcon}</span> : null}
        <span className="ft-button__label">{children}</span>
        {!loading && trailingIcon ? <span className="ft-button__icon ft-button__icon--trailing">{trailingIcon}</span> : null}
      </span>
    </button>
  );
});
