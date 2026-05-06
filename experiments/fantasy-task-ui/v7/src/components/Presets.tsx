import { forwardRef } from 'react';
import { Button, type ButtonProps } from './Button';

function withVariant(variant: ButtonProps['variant']) {
  return forwardRef<HTMLButtonElement, Omit<ButtonProps, 'variant'>>(function PresetButton(props, ref) {
    return <Button ref={ref} variant={variant} {...props} />;
  });
}

export const PrimaryButton = withVariant('primary');
export const SecondaryButton = withVariant('secondary');
export const GhostButton = withVariant('ghost');
export const DangerButton = withVariant('danger');
export const SuccessButton = withVariant('success');
export const SubtleButton = withVariant('subtle');
