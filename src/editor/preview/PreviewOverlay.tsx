import { useLayoutEffect, useRef } from 'react';
import '@/player/player.css';
import { Player } from '@/player/player';
import { assetUrls } from '../assets/asset-urls';
import { useProject } from '../store/selectors';
import { useUiStore } from '../store/ui-store';

/**
 * Full-screen reader mode. It mounts the exact Player class that ships inside exported books,
 * fed with the live document, so what you preview is what readers get.
 */
export function PreviewOverlay({ onClose }: { onClose: () => void }) {
  const project = useProject();
  const hostRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useLayoutEffect(() => {
    const ui = useUiStore.getState();
    ui.setPlayerOpen(true);
    const startPage = Math.max(0, project.pages.findIndex((p) => p.id === ui.activePageId));
    const player = new Player({
      mount: hostRef.current!,
      project,
      resolveAsset: assetUrls.resolveFull,
      startPage,
      showBadge: false,
      onExit: () => {
        const page = project.pages[player.pageIndex];
        if (page) useUiStore.getState().setActivePage(page.id);
        onCloseRef.current();
      },
    });
    return () => {
      player.destroy();
      useUiStore.getState().setPlayerOpen(false);
    };
  }, [project]);

  return (
    <div
      ref={hostRef}
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${project.title}`}
      data-testid="preview"
    />
  );
}
