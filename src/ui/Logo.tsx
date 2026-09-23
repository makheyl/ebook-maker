import { PRODUCT_NAME } from '@/core/brand';
import { cn } from '@/ui/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-7', className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M9 8h9a5 5 0 0 1 5 5v11H14a5 5 0 0 1-5-5z" fill="#fff" opacity=".95" />
      <path d="M13 13h6M13 17h5" className="stroke-primary" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <LogoMark />
      <span className="text-lg">{PRODUCT_NAME}</span>
    </span>
  );
}
