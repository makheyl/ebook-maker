import { useEffect, useRef } from 'react';
import { getTransition } from '@/core/animation';
import { Curl } from '../../player/curl';

/**
 * A tiny looping demo of a page transition (two coloured "pages"), using the reader's own code
 * — the same keyframes, and the player's curl for "Page curl". Runs only while shown.
 */
export function TransitionPreview({ preset }: { preset: string }) {
  const bookRef = useRef<HTMLDivElement>(null);
  const aRef = useRef<HTMLDivElement>(null);
  const bRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const book = bookRef.current;
    const a = aRef.current;
    const b = bRef.current;
    if (!book || !a || !b) return;
    // Reduced motion: no looping demo (the reader fades instead of these transitions anyway).
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let anims: Animation[] = [];
    let curl: Curl | null = null;
    const transition = getTransition(preset);
    const loop = (forward: boolean) => {
      if (stopped) return;
      const [from, to] = forward ? [a, b] : [b, a];
      from.style.zIndex = '1';
      to.style.zIndex = '2';
      if (transition.curl) {
        curl = new Curl(book, from, to, 0);
        void curl.run(1, 900).then(() => {
          curl?.destroy();
          curl = null;
          from.style.zIndex = '1';
          to.style.zIndex = '2';
          timer = setTimeout(() => loop(!forward), 600);
        });
        return;
      }
      const kf = transition.build(1);
      const opts: KeyframeAnimationOptions = {
        duration: 700,
        easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
        fill: 'both',
      };
      anims = [
        ...(kf.in ? [to.animate(kf.in, opts)] : []),
        ...(kf.out ? [from.animate(kf.out, opts)] : []),
      ];
      timer = setTimeout(() => {
        anims.forEach((x) => x.cancel());
        loop(!forward);
      }, 1300);
    };
    loop(true);
    return () => {
      stopped = true;
      clearTimeout(timer);
      anims.forEach((x) => x.cancel());
      curl?.destroy();
    };
  }, [preset]);

  const page = 'absolute inset-0 grid place-items-center text-sm font-semibold';
  return (
    <div
      ref={bookRef}
      aria-hidden="true"
      data-testid="transition-preview"
      className="relative mx-auto h-20 w-28 overflow-hidden rounded-sm shadow-md [perspective:600px]"
    >
      <div ref={bRef} className={`${page} bg-amber-200 text-amber-900`}>
        2
      </div>
      <div ref={aRef} className={`${page} bg-sky-200 text-sky-900`}>
        1
      </div>
    </div>
  );
}
