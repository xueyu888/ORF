import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function SvgBase({ size = 24, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function CompassIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.6" opacity="0.9" />
      <path d="M12 2.8L13.7 10.3L21.2 12L13.7 13.7L12 21.2L10.3 13.7L2.8 12L10.3 10.3L12 2.8Z" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="#59A7FF" />
    </SvgBase>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M8.2 5.5H15.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.5 4.4H14.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7.4 7.2H16.6V18.3C16.6 19.1 15.95 19.75 15.15 19.75H8.85C8.05 19.75 7.4 19.1 7.4 18.3V7.2Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 10V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14 10V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </SvgBase>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.3 12.3L10.8 14.8L15.9 9.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </SvgBase>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M4.2 6.2H19.8L14 12.4V17.4L10 19V12.4L4.2 6.2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </SvgBase>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M9 5L16 12L9 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </SvgBase>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </SvgBase>
  );
}

export function SaveSparkIcon(props: IconProps) {
  return (
    <SvgBase {...props}>
      <path d="M12 3.4L13.6 7.4L17.6 9L13.6 10.6L12 14.6L10.4 10.6L6.4 9L10.4 7.4L12 3.4Z" fill="currentColor" />
    </SvgBase>
  );
}
