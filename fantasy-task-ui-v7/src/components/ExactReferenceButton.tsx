import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import exactReferenceButton from '../assets/exact-reference-button.png';

export interface ExactReferenceButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual width of the button. The PNG skin keeps its original aspect ratio.
   * Use 1928 for native 1x pixel rendering.
   */
  width?: number | string;
  /** Accessible label. The visible label is baked into the exact visual skin. */
  label?: string;
}

type ExactButtonStyle = CSSProperties & { '--ft-exact-button-width'?: string };

export const ExactReferenceButton = forwardRef<HTMLButtonElement, ExactReferenceButtonProps>(
  function ExactReferenceButton({ width = 964, label = '新建任务', className, style, type = 'button', children, ...rest }, ref) {
    const visualWidth = typeof width === 'number' ? `${width}px` : width;
    const mergedStyle: ExactButtonStyle = {
      '--ft-exact-button-width': visualWidth,
      ...style,
    };

    return (
      <button
        ref={ref}
        type={type}
        className={['ft-exact-reference-button', className ?? ''].filter(Boolean).join(' ')}
        style={mergedStyle}
        aria-label={label}
        {...rest}
      >
        <img className="ft-exact-reference-button__image" src={exactReferenceButton} alt="" draggable={false} aria-hidden="true" />
        <span className="ft-sr-only">{children ?? label}</span>
      </button>
    );
  },
);
