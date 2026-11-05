export type Axis = 'x' | 'y';

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface StyledElement {
  element: Element;
  style: CSSStyleDeclaration;
}

export type WheelTarget = Element | 'viewport' | 'blocked';

const isVisibleOverflow = (overflow: string) => overflow === '' || overflow === 'visible';
const isUserScrollable = (overflow: string) => overflow === 'auto' || overflow === 'scroll';
const overflowOn = (style: CSSStyleDeclaration, axis: Axis) =>
  axis === 'x' ? style.overflowX : style.overflowY;

function isSet(value: string | undefined): boolean {
  return !!value && value !== 'none';
}

function parentInFlatTree(element: Element): Element | null {
  if (element.assignedSlot) return element.assignedSlot;
  if (element.parentElement) return element.parentElement;
  const parent = element.parentNode;
  return parent && 'host' in parent ? (parent as ShadowRoot).host : null;
}

function establishesFixedContainingBlock(style: CSSStyleDeclaration): boolean {
  return (
    isSet(style.transform) ||
    isSet(style.perspective) ||
    isSet(style.filter) ||
    isSet(style.getPropertyValue('backdrop-filter')) ||
    /\b(transform|perspective|filter)\b/.test(style.willChange ?? '') ||
    /\b(paint|layout|strict|content)\b/.test(style.contain ?? '')
  );
}

function containsBox(position: string, ancestor: CSSStyleDeclaration): boolean {
  if (position === 'fixed') return establishesFixedContainingBlock(ancestor);
  if (position === 'absolute') {
    const ancestorPosition = ancestor.position;
    return (
      (ancestorPosition !== '' && ancestorPosition !== 'static') ||
      establishesFixedContainingBlock(ancestor)
    );
  }
  return true;
}

// Walks the containing-block chain rather than the DOM chain, because only those
// ancestors clip a box or carry it along when they scroll. Shadow roots and slots
// are crossed through the flat tree.
function* containingAncestors(element: Element): Generator<StyledElement> {
  let position = getComputedStyle(element).position;
  for (
    let ancestor = parentInFlatTree(element);
    ancestor && ancestor !== document.documentElement;
    ancestor = parentInFlatTree(ancestor)
  ) {
    const style = getComputedStyle(ancestor);
    if (!containsBox(position, style)) continue;
    yield { element: ancestor, style };
    position = style.position;
  }
}

// With a visible root overflow, the body's overflow applies to the viewport instead.
function bodyScrollsViewport(): boolean {
  const root = getComputedStyle(document.documentElement);
  return isVisibleOverflow(root.overflowX) && isVisibleOverflow(root.overflowY);
}

function scrollsOn({ element, style }: StyledElement, axis: Axis): boolean {
  if (element === document.body && bodyScrollsViewport()) return false;
  return isUserScrollable(overflowOn(style, axis));
}

function clipsContent({ element, style }: StyledElement): boolean {
  if (element === document.body && bodyScrollsViewport()) return false;
  return !isVisibleOverflow(style.overflowX) || !isVisibleOverflow(style.overflowY);
}

function hasOverflow(element: Element, axis: Axis): boolean {
  return axis === 'x'
    ? element.scrollWidth > element.clientWidth
    : element.scrollHeight > element.clientHeight;
}

function canScroll(element: Element, axis: Axis, delta: number): boolean {
  if (axis === 'x') {
    return delta < 0
      ? element.scrollLeft > 0
      : element.scrollLeft + element.clientWidth < element.scrollWidth;
  }
  return delta < 0
    ? element.scrollTop > 0
    : element.scrollTop + element.clientHeight < element.scrollHeight;
}

/** Elements whose overflow clips `element`, innermost first, including the element itself. */
export function clippingContainersOf(element: Element): Element[] {
  const self = { element, style: getComputedStyle(element) };
  const containers = clipsContent(self) ? [element] : [];
  for (const ancestor of containingAncestors(element)) {
    if (clipsContent(ancestor)) containers.push(ancestor.element);
  }
  return containers;
}

/** The padding box in viewport coordinates, which is the area overflow clips to. */
export function clientBox(element: Element): Box {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left + element.clientLeft,
    top: rect.top + element.clientTop,
    width: element.clientWidth,
    height: element.clientHeight,
  };
}

/** How far a point lies outside a box, or 0 when it is inside. */
export function distanceOutside(box: Box, x: number, y: number): number {
  return Math.max(
    box.left - x,
    x - (box.left + box.width),
    box.top - y,
    y - (box.top + box.height),
    0
  );
}

export function expandBox(box: Box, by: number): Box {
  return {
    left: box.left - by,
    top: box.top - by,
    width: box.width + by * 2,
    height: box.height + by * 2,
  };
}

/** The innermost page element at a point, looking into open shadow roots. */
export function pageElementAtPoint(x: number, y: number): Element | undefined {
  let element = document.elementFromPoint?.(x, y) ?? null;
  while (element?.shadowRoot) {
    const inner = element.shadowRoot.elementFromPoint?.(x, y);
    if (!inner || inner === element) break;
    element = inner;
  }
  if (!element || element === document.documentElement) return undefined;
  if (element === document.body && bodyScrollsViewport()) return undefined;
  return element;
}

/**
 * Resolves which scroller a wheel delta on one axis belongs to, following the
 * browser's chaining rules: the innermost container that can still move, unless an
 * exhausted container stops chaining with `overscroll-behavior`.
 */
export function wheelTarget(start: Element | undefined, axis: Axis, delta: number): WheelTarget {
  if (!start) return 'viewport';
  const chain = [{ element: start, style: getComputedStyle(start) }, ...containingAncestors(start)];
  for (const candidate of chain) {
    if (!scrollsOn(candidate, axis)) continue;
    if (canScroll(candidate.element, axis, delta)) return candidate.element;
    const overscroll =
      axis === 'x' ? candidate.style.overscrollBehaviorX : candidate.style.overscrollBehaviorY;
    if (overscroll && overscroll !== 'auto' && hasOverflow(candidate.element, axis)) {
      return 'blocked';
    }
  }
  return 'viewport';
}

/** Whether the user, not only script, can scroll the viewport on an axis. */
export function viewportScrolls(axis: Axis): boolean {
  const root = getComputedStyle(document.documentElement);
  const source = bodyScrollsViewport() ? getComputedStyle(document.body) : root;
  const overflow = overflowOn(source, axis);
  return overflow !== 'hidden' && overflow !== 'clip';
}
