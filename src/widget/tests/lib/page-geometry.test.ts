import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  clippingContainersOf,
  pageElementAtPoint,
  viewportScrolls,
  wheelTarget,
} from '../../lib/page-geometry';
import { installDom } from '../helpers/dom';

let restoreDom: (() => void) | null = null;

function element(style: string, parent: Element = document.body): HTMLElement {
  const node = document.createElement('div');
  node.setAttribute('style', style);
  parent.append(node);
  return node;
}

function scrollable(
  node: HTMLElement,
  size: Partial<Record<'clientWidth' | 'clientHeight' | 'scrollWidth' | 'scrollHeight', number>>
): HTMLElement {
  Object.entries(size).forEach(([key, value]) =>
    Object.defineProperty(node, key, { configurable: true, value })
  );
  return node;
}

beforeEach(() => {
  restoreDom = installDom();
});

afterEach(() => {
  restoreDom?.();
  restoreDom = null;
});

describe('clippingContainersOf', () => {
  it('lists every overflow container from the element outward', () => {
    const outer = element('overflow-y: auto');
    const card = element('overflow-x: hidden; overflow-y: hidden', outer);
    const label = element('overflow-x: hidden; overflow-y: hidden', card);

    expect(clippingContainersOf(label)).toEqual([label, card, outer]);
  });

  it('skips containers a fixed element escapes', () => {
    const pane = element('overflow-y: auto');
    const toolbar = element('position: fixed', pane);
    const button = element('', toolbar);

    expect(clippingContainersOf(button)).toEqual([]);
  });

  it('keeps containers a transformed ancestor brings into a fixed element', () => {
    const pane = element('overflow-y: auto; transform: translateZ(0)');
    const toolbar = element('position: fixed', pane);

    expect(clippingContainersOf(toolbar)).toEqual([pane]);
  });

  it('skips static containers an absolute element escapes', () => {
    const positioned = element('position: relative; overflow-y: auto');
    const clipped = element('overflow-y: hidden', positioned);
    const menu = element('position: absolute', clipped);

    expect(clippingContainersOf(menu)).toEqual([positioned]);
  });

  it('crosses shadow roots to reach containers in the page', () => {
    const pane = element('overflow-y: auto');
    const host = element('', pane);
    const inner = document.createElement('div');
    host.attachShadow({ mode: 'open' }).append(inner);

    expect(clippingContainersOf(inner)).toEqual([pane]);
  });

  it('ignores the body when its overflow belongs to the viewport', () => {
    document.body.setAttribute('style', 'overflow-y: auto');
    const node = element('');

    expect(clippingContainersOf(node)).toEqual([]);
  });
});

describe('wheelTarget', () => {
  it('routes each axis to the innermost container that can move on it', () => {
    const page = scrollable(element('overflow-y: auto'), { clientHeight: 400, scrollHeight: 900 });
    const table = scrollable(element('overflow-x: auto', page), {
      clientWidth: 300,
      scrollWidth: 900,
    });
    const cell = element('', table);

    expect(wheelTarget(cell, 'x', 2)).toBe(table);
    expect(wheelTarget(cell, 'y', 40)).toBe(page);
  });

  it('chains past an exhausted container', () => {
    const outer = scrollable(element('overflow-y: auto'), { clientHeight: 400, scrollHeight: 900 });
    const inner = scrollable(element('overflow-y: auto', outer), {
      clientHeight: 100,
      scrollHeight: 300,
    });
    inner.scrollTop = 200;

    expect(wheelTarget(inner, 'y', 40)).toBe(outer);
    expect(wheelTarget(inner, 'y', -40)).toBe(inner);
  });

  it('stops chaining at an exhausted container with contained overscroll', () => {
    const inner = scrollable(element('overflow-y: auto; overscroll-behavior-y: contain'), {
      clientHeight: 100,
      scrollHeight: 300,
    });
    inner.scrollTop = 200;

    expect(wheelTarget(inner, 'y', 40)).toBe('blocked');
  });

  it('falls back to the viewport without a scrollable container', () => {
    expect(wheelTarget(element(''), 'y', 40)).toBe('viewport');
    expect(wheelTarget(undefined, 'y', 40)).toBe('viewport');
  });
});

describe('pageElementAtPoint', () => {
  it('looks into open shadow roots', () => {
    const host = element('');
    const shadow = host.attachShadow({ mode: 'open' });
    const inner = document.createElement('div');
    shadow.append(inner);
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => host });
    Object.defineProperty(shadow, 'elementFromPoint', { configurable: true, value: () => inner });

    expect(pageElementAtPoint(5, 5)).toBe(inner);
  });

  it('treats the root and a viewport-scrolling body as no element', () => {
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => document.body,
    });

    expect(pageElementAtPoint(5, 5)).toBeUndefined();
  });
});

describe('viewportScrolls', () => {
  it('follows the overflow that applies to the viewport', () => {
    expect(viewportScrolls('y')).toBe(true);
    document.body.setAttribute('style', 'overflow-y: hidden');
    expect(viewportScrolls('y')).toBe(false);
    document.documentElement.setAttribute('style', 'overflow-y: auto');
    expect(viewportScrolls('y')).toBe(true);
  });
});
