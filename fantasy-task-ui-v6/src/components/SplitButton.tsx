import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Button, type ButtonVariant, type ButtonSize } from './Button';
import { OrnateChevronRightIcon } from '../icons/IllustratedIcons';

export interface SplitButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  menuLabel?: string;
  onMenuClick?: () => void;
  menuDisabled?: boolean;
}

export const SplitButton = forwardRef<HTMLButtonElement, SplitButtonProps>(function SplitButton(
  {
    variant = 'primary',
    size = 'md',
    leadingIcon,
    trailingIcon,
    menuLabel = '更多操作',
    onMenuClick,
    menuDisabled = false,
    className,
    disabled,
    children,
    ...rest
  },
  ref,
) {
  return (
    <span className={['ft-split-button', `ft-split-button--${variant}`, `ft-split-button--${size}`, className ?? ''].filter(Boolean).join(' ')}>
      <Button
        ref={ref}
        variant={variant}
        size={size}
        leadingIcon={leadingIcon}
        trailingIcon={trailingIcon}
        disabled={disabled}
        className="ft-split-button__main"
        {...rest}
      >
        {children}
      </Button>
      <button
        type="button"
        className="ft-split-button__menu"
        aria-label={menuLabel}
        onClick={onMenuClick}
        disabled={disabled || menuDisabled}
      >
        <span className="ft-split-button__menu-frame" aria-hidden="true" />
        <span className="ft-split-button__menu-shine" aria-hidden="true" />
        <span className="ft-split-button__menu-icon"><OrnateChevronRightIcon /></span>
      </button>
    </span>
  );
});
