import type { VoiceLanguage } from '../core/schema';
import { el } from './dom';

/**
 * The card over the first page of a book with voiceover: "Listen in: English · Tagalog · Read
 * it myself". Picking one is the gesture that lets the book start talking.
 */
export function buildListenCard(opts: {
  title: string;
  languages: readonly VoiceLanguage[];
  preselected: string;
  onPick: (choice: string) => void;
}): { el: HTMLElement; focus: () => void } {
  const card = el('div', 'fp-listen');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'fp-listen-title');
  const box = el('div', 'fp-listen-box');
  const heading = el('h2', 'fp-listen-title', opts.title);
  heading.id = 'fp-listen-title';
  const prompt = el('p', 'fp-listen-prompt', 'Listen in:');
  const row = el('div', 'fp-listen-choices');
  const buttons: HTMLButtonElement[] = [];
  const add = (label: string, choice: string, cls: string, lang?: string) => {
    const b = el('button', cls, label);
    b.type = 'button';
    if (lang) b.lang = lang;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onPick(choice);
    });
    buttons.push(b);
    return b;
  };
  for (const l of opts.languages) row.appendChild(add(l.name, l.code, 'fp-listen-lang', l.code));
  const self = add('Read it myself', 'off', 'fp-listen-self');
  box.append(heading, prompt, row, self);
  card.appendChild(box);
  const preselected = buttons.find((_, i) =>
    i < opts.languages.length
      ? opts.languages[i]!.code === opts.preselected
      : opts.preselected === 'off',
  );
  card.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      opts.onPick(opts.preselected);
      return;
    }
    if (e.key !== 'Tab') return;
    const first = buttons[0]!;
    const last = buttons[buttons.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  return { el: card, focus: () => (preselected ?? buttons[0])?.focus({ preventScroll: true }) };
}

/** The reader's voice menu, above the toolbar: languages, No voice, Read to me, Listen again. */
export class AudioMenu {
  readonly el: HTMLElement;
  private returnFocus: HTMLElement | null = null;
  private readonly radios = new Map<string, HTMLButtonElement>();
  private readonly readToMe: HTMLButtonElement;

  constructor(opts: {
    languages: readonly VoiceLanguage[];
    onLanguage: (choice: string) => void;
    onReadToMe: (on: boolean) => void;
    onListenAgain: () => void;
    onClose: () => void;
  }) {
    this.el = el('div', 'fp-audio-menu');
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Voiceover');
    const group = el('div', 'fp-audio-langs');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Voiceover language');
    const radio = (label: string, choice: string, lang?: string) => {
      const b = el('button', 'fp-audio-radio', label);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      if (lang) b.lang = lang;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onLanguage(choice);
      });
      this.radios.set(choice, b);
      group.appendChild(b);
    };
    for (const l of opts.languages) radio(l.name, l.code, l.code);
    radio('No voice', 'off');
    this.readToMe = el('button', 'fp-audio-switch', 'Turn pages for me');
    this.readToMe.type = 'button';
    this.readToMe.setAttribute('role', 'switch');
    this.readToMe.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onReadToMe(this.readToMe.getAttribute('aria-checked') !== 'true');
    });
    const again = el('button', 'fp-audio-again', 'Listen again');
    again.type = 'button';
    again.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onListenAgain();
    });
    this.el.append(group, this.readToMe, again);
    this.el.addEventListener('click', (e) => e.stopPropagation());
    this.el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        opts.onClose();
      }
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  update(choice: string, readToMe: boolean): void {
    for (const [value, b] of this.radios) b.setAttribute('aria-checked', String(value === choice));
    this.readToMe.setAttribute('aria-checked', String(readToMe));
    this.readToMe.disabled = choice === 'off';
  }

  open(returnFocus: HTMLElement | null): void {
    this.returnFocus = returnFocus;
    this.el.hidden = false;
    const checked = [...this.radios.values()].find(
      (b) => b.getAttribute('aria-checked') === 'true',
    );
    (checked ?? this.radios.values().next().value)?.focus({ preventScroll: true });
  }

  close(): void {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.returnFocus?.focus({ preventScroll: true });
    this.returnFocus = null;
  }
}
