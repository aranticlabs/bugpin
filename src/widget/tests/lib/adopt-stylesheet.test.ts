import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { adoptStylesheet } from '../../lib/adopt-stylesheet';
import { installDom } from '../helpers/dom';

class FakeStyleSheet {
  css = '';
  replaceSync(css: string) {
    this.css = css;
  }
}

const scope = globalThis as unknown as { CSSStyleSheet?: unknown };
const originalStyleSheet = scope.CSSStyleSheet;
let restoreDom: (() => void) | null = null;

beforeEach(() => {
  restoreDom = installDom();
});

afterEach(() => {
  restoreDom?.();
  restoreDom = null;
  scope.CSSStyleSheet = originalStyleSheet;
});

describe('adoptStylesheet', () => {
  it('appends a constructable stylesheet and removes only that sheet on cleanup', () => {
    scope.CSSStyleSheet = FakeStyleSheet;
    const existing = new FakeStyleSheet();
    const target = { adoptedStyleSheets: [existing] } as unknown as ShadowRoot;

    const remove = adoptStylesheet(target, 'a { color: red; }');

    const sheets = target.adoptedStyleSheets as unknown as FakeStyleSheet[];
    expect(sheets).toHaveLength(2);
    expect(sheets[0]).toBe(existing);
    expect(sheets[1].css).toBe('a { color: red; }');

    remove();
    expect(target.adoptedStyleSheets as unknown as FakeStyleSheet[]).toEqual([existing]);
  });

  it('falls back to a style element in the document head', () => {
    scope.CSSStyleSheet = undefined;

    const remove = adoptStylesheet(document, 'a { color: red; }');

    const styles = [...document.head.querySelectorAll('style')];
    expect(styles.some((style) => style.textContent === 'a { color: red; }')).toBe(true);

    remove();
    expect(
      [...document.head.querySelectorAll('style')].some(
        (style) => style.textContent === 'a { color: red; }'
      )
    ).toBe(false);
  });

  it('falls back to a style element inside a shadow root', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });

    adoptStylesheet(shadow, 'p { margin: 0; }');

    expect(shadow.querySelector('style')?.textContent).toBe('p { margin: 0; }');
  });
});
