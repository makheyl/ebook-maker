import { plainText } from '../schema/text';
import type { PageElement } from '../schema/types';

/**
 * The name a screen reader announces for a tappable element: its own label, a button's text,
 * a picture's alt text, the character it shows, or a speech bubble's words. '' when none of those exist (the reader
 * then falls back to the layer name, and the editor checks ask for a real one).
 */
export function accessibleName(element: PageElement, characterName?: string): string {
  if (element.a11yLabel?.trim()) return element.a11yLabel.trim();
  if (element.type === 'button' && element.iconPosition !== 'only') return element.label.trim();
  if (element.type === 'image') return element.alt?.trim() || characterName?.trim() || '';
  if (element.type === 'bubble') return plainText(element.content).replace(/\s+/g, ' ').trim();
  return '';
}
