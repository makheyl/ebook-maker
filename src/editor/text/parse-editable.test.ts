import { describe, expect, it } from 'vitest';
import { createTextElement } from '@/core/schema';
import { buildText } from '@/core/render/nodes';
import { parseEditable } from './parse-editable';

function fromHtml(html: string) {
  // Test fixture only: simulates the DOM a contentEditable produces.
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body
    .firstElementChild as HTMLElement;
  return parseEditable(root);
}

describe('parseEditable', () => {
  it('round-trips the renderer output', () => {
    const el = createTextElement('Line one\nLine two', { x: 0, y: 0, width: 10, height: 10 });
    el.content[1]!.runs = [{ text: 'Line ' }, { text: 'two', bold: true, color: '#ff0000' }];
    const inner = buildText(el).querySelector<HTMLElement>('.fl-text-inner')!;
    expect(parseEditable(inner)).toEqual(el.content);
  });

  it('maps b/i/u tags and inline styles to marks', () => {
    expect(
      fromHtml('<p>a<b>b</b><i>c</i><u>d</u><span style="font-weight:700">e</span></p>'),
    ).toEqual([
      {
        runs: [
          { text: 'a' },
          { text: 'b', bold: true },
          { text: 'c', italic: true },
          { text: 'd', underline: true },
          { text: 'e', bold: true },
        ],
      },
    ]);
  });

  it('treats divs and <br> as paragraph breaks and keeps empty lines', () => {
    expect(fromHtml('<p>one</p><p><br></p><div>three</div>')).toEqual([
      { runs: [{ text: 'one' }] },
      { runs: [{ text: '' }] },
      { runs: [{ text: 'three' }] },
    ]);
    expect(fromHtml('one<br>two')).toEqual([
      { runs: [{ text: 'one' }] },
      { runs: [{ text: 'two' }] },
    ]);
  });

  it('drops unknown markup and attributes but keeps the text', () => {
    const result = fromHtml('<p><a href="https://x">link</a><img src=x><script>bad()</script></p>');
    expect(result).toEqual([{ runs: [{ text: 'linkbad()' }] }]);
  });

  it('ignores unsafe colors', () => {
    const result = fromHtml('<p><span style="color: var(--x)">x</span></p>');
    expect(result[0]!.runs[0]!.color).toBeUndefined();
  });
});
