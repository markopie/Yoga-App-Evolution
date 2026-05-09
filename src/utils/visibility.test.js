import { test, describe } from 'node:test';
import assert from 'node:assert';
import { isElementDisplayed } from './visibility.js';

describe('visibility helpers', () => {
  test('treats CSS-hidden elements as not displayed when inline display is unset', () => {
    const originalGetComputedStyle = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () => ({ display: 'none' });

    try {
      assert.strictEqual(isElementDisplayed({ style: { display: '' } }), false);
    } finally {
      if (originalGetComputedStyle) {
        globalThis.getComputedStyle = originalGetComputedStyle;
      } else {
        delete globalThis.getComputedStyle;
      }
    }
  });

  test('inline display takes precedence over computed display', () => {
    const originalGetComputedStyle = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () => ({ display: 'none' });

    try {
      assert.strictEqual(isElementDisplayed({ style: { display: 'flex' } }), true);
      assert.strictEqual(isElementDisplayed({ style: { display: 'none' } }), false);
    } finally {
      if (originalGetComputedStyle) {
        globalThis.getComputedStyle = originalGetComputedStyle;
      } else {
        delete globalThis.getComputedStyle;
      }
    }
  });
});
