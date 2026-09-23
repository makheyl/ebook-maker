import '../core/render/render.css';
import './player.css';
import { BOOK_DATA_ID, BOOK_ROOT_ID, isBookData } from '../core/export/format';
import { Player } from './player';

/**
 * Entry point of the standalone reader bundled into exported books. It reads the embedded
 * book JSON and mounts the player — no network, no framework.
 */
function pageFromHash(): number | undefined {
  const raw = new URLSearchParams(location.hash.slice(1)).get('page');
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n - 1 : undefined;
}

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
    // "#page=3" opens a given page; otherwise the reader continues where they left off.
    startPage: pageFromHash(),
    resume: true,
  });
  (window as unknown as { folioPlayer?: Player }).folioPlayer = player;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
