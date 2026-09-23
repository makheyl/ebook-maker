import '../core/render/render.css';
import './player.css';
import { BOOK_DATA_ID, BOOK_ROOT_ID, isBookData } from '../core/export/format';
import { Player } from './player';

/**
 * Entry point of the standalone reader bundled into exported books. It reads the embedded
 * book JSON and mounts the player — no network, no framework.
 */
function boot() {
  const mount = document.getElementById(BOOK_ROOT_ID);
  const dataEl = document.getElementById(BOOK_DATA_ID);
  if (!mount) return;
  let data: unknown = null;
  try {
    data = JSON.parse(dataEl?.textContent ?? 'null');
  } catch {
    data = null;
  }
  if (!isBookData(data)) {
    mount.textContent = 'This book could not be opened: its data is missing or damaged.';
    mount.setAttribute('role', 'alert');
    return;
  }
  const player = new Player({
    mount,
    project: data.project,
    resolveAsset: (id) => data.assets[id],
    showBadge: data.options.showBadge,
    startPage: Math.max(
      0,
      Number(new URLSearchParams(location.hash.slice(1)).get('page') ?? 1) - 1,
    ),
  });
  (window as unknown as { folioPlayer?: Player }).folioPlayer = player;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
