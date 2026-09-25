import markUrl from '@/assets/brand/inkbug-mark.png';
import { PRODUCT_NAME } from '@/core/brand';
import { cn } from '@/ui/utils';

/** The bookworm peeking over its glasses (built by `scripts/make-brand-icons.mjs`). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src={markUrl}
      alt=""
      aria-hidden="true"
      width={96}
      height={96}
      draggable={false}
      className={cn('size-7 shrink-0 rounded-[22%] shadow-sm shadow-forest/20', className)}
    />
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <LogoMark />
      <span className="brand-wordmark text-lg">{PRODUCT_NAME}</span>
    </span>
  );
}
