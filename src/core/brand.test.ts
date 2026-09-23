import { describe, expect, it } from 'vitest';
import { MADE_WITH_LABEL, PRODUCT_NAME } from './brand';

describe('brand', () => {
  it('derives the badge label from the product name', () => {
    expect(MADE_WITH_LABEL).toContain(PRODUCT_NAME);
  });
});
