import { el, icon } from './dom';

/** "The End" overlay: read again, go back, or open the page menu. */
export function buildEnd(actions: {
  onRestart: () => void;
  onBack: () => void;
  onPages?: () => void;
}): HTMLElement {
  const end = el('div', 'fp-end');
  end.hidden = true;
  end.setAttribute('role', 'dialog');
  end.setAttribute('aria-modal', 'false');
  end.setAttribute('aria-labelledby', 'fp-end-title');
  const card = el('div', 'fp-end-card');
  const title = el('h2', 'fp-end-title', 'The End');
  title.id = 'fp-end-title';
  const row = el('div', 'fp-end-actions');
  const button = (label: string, onClick: () => void, primary = false) => {
    const b = el('button', primary ? 'fp-end-btn fp-end-primary' : 'fp-end-btn');
    b.type = 'button';
    if (primary) b.append(icon('restart'));
    b.append(document.createTextNode(label));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  };
  row.append(button('Back', actions.onBack));
  if (actions.onPages) row.append(button('Pages', actions.onPages));
  row.append(button('Read again', actions.onRestart, true));
  card.append(title, row);
  end.appendChild(card);
  return end;
}
