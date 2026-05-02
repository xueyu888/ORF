import { type ButtonHTMLAttributes, type ReactNode } from 'react';

export interface SegmentedButtonItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedButtonProps {
  items: SegmentedButtonItem[];
  value: string;
  onChange?: (key: string) => void;
  size?: 'sm' | 'md';
  className?: string;
  buttonProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>;
}

export function SegmentedButton({ items, value, onChange, size = 'md', className, buttonProps }: SegmentedButtonProps) {
  const classes = ['ft-segmented', `ft-segmented--${size}`, className ?? ''].filter(Boolean).join(' ');

  return (
    <div className={classes} role="tablist" aria-label="Segmented Button">
      <span className="ft-segmented__frame" aria-hidden="true" />
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            className={['ft-segmented__item', active ? 'is-active' : ''].filter(Boolean).join(' ')}
            onClick={() => {
              if (!item.disabled) onChange?.(item.key);
            }}
            {...buttonProps}
          >
            <span className="ft-segmented__item-bg" aria-hidden="true" />
            {item.icon ? <span className="ft-segmented__icon">{item.icon}</span> : null}
            <span className="ft-segmented__label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
