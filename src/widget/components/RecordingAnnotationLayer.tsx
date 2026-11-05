import { FunctionComponent, JSX } from 'preact';
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { canRestrictCapture } from '../capture/recorder';
import type { RecordingStroke, RecordingTool, StrokeAnchor } from '../hooks/use-recording-tools';
import {
  type Axis,
  type Box,
  clientBox,
  clippingContainersOf,
  distanceOutside,
  expandBox,
  pageElementAtPoint,
  viewportScrolls,
  type WheelTarget,
  wheelTarget,
} from '../lib/page-geometry';
import { cn } from '../lib/utils';

const LAYER_CLASS = 'fixed inset-0 z-[2147483646] h-full w-full';
const FRAME_WIDTH = 4;
const FRAME_COLOR = '#dc2626';
const FRAME_PAUSED_COLOR = '#737373';
const PEN_WIDTH = 4;
const LASER_COLOR = '#ef4444';
const LASER_TRAIL_MS = 800;
const LASER_DOT_RADIUS = 4;
const LASER_GLOW_RADIUS = 18;
const RIPPLE_MS = 520;
const RIPPLE_FALLBACK_COLOR = '#02658D';
const WHEEL_LINE_PX = 16;
// A stroke may overshoot a container by this much, as a circle drawn around content
// near its edge does, and still scroll with that content.
const CLIP_TOLERANCE_PX = 32;
// Wheel events closer together than this belong to one gesture and keep their scroller.
const WHEEL_LATCH_MS = 200;
const WHEEL_LATCH_DISTANCE_PX = 8;

interface Point {
  x: number;
  y: number;
}

interface TrailPoint extends Point {
  time: number;
}

interface Ripple extends Point {
  start: number;
  expands: boolean;
  color: string;
}

interface EffectsState {
  head: Point | null;
  trail: TrailPoint[];
  ripples: Ripple[];
  frame: number;
}

interface RecordingAnnotationLayerProps {
  tool: RecordingTool;
  clickEffects: boolean;
  color: string;
  strokes: RecordingStroke[];
  isActive: boolean;
  isPaused: boolean;
  onStrokeComplete: (stroke: RecordingStroke) => void;
}

function scaleCanvas(canvas: HTMLCanvasElement): void {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * ratio;
  canvas.height = window.innerHeight * ratio;
  canvas.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function clearCanvas(context: CanvasRenderingContext2D): void {
  context.clearRect(0, 0, window.innerWidth, window.innerHeight);
}

interface PagePoint extends Point {
  scrollX: number;
  scrollY: number;
}

interface Placement {
  origin: Point;
  clips: Box[];
}

interface WheelLatch {
  start: Element | undefined;
  clientX: number;
  clientY: number;
  time: number;
  x: WheelTarget | null;
  y: WheelTarget | null;
}

function anchorOrigin(anchor?: StrokeAnchor): Point {
  if (!anchor) return { x: -window.scrollX, y: -window.scrollY };
  const { element, followsScroll } = anchor;
  const rect = element.getBoundingClientRect();
  return followsScroll
    ? { x: rect.left - element.scrollLeft, y: rect.top - element.scrollTop }
    : { x: rect.left, y: rect.top };
}

function elementBelowCanvas(canvas: HTMLCanvasElement, x: number, y: number): Element | undefined {
  const pointerEvents = canvas.style.pointerEvents;
  canvas.style.pointerEvents = 'none';
  const element = pageElementAtPoint(x, y);
  canvas.style.pointerEvents = pointerEvents;
  return element;
}

// A stroke that clearly leaves a container while being drawn is no longer clipped by
// it. It is re-anchored to that container's box so it keeps moving with the container
// but no longer with the content scrolling inside it. A slight overshoot only widens
// the clip so the stroke is never cut while it stays put.
function releaseExitedClips(stroke: RecordingStroke, x: number, y: number): void {
  const { anchor } = stroke;
  if (!anchor) return;
  let exited = -1;
  anchor.clips.forEach((clip, index) => {
    const distance = distanceOutside(clientBox(clip.element), x, y);
    if (distance > CLIP_TOLERANCE_PX) exited = index;
    else clip.outset = Math.max(clip.outset, distance);
  });
  if (exited < 0) return;
  const before = anchorOrigin(anchor);
  stroke.anchor = {
    element: anchor.clips[exited].element,
    followsScroll: false,
    clips: anchor.clips.slice(exited + 1),
  };
  const after = anchorOrigin(stroke.anchor);
  const dx = before.x - after.x;
  const dy = before.y - after.y;
  stroke.points.forEach((point) => {
    point[0] += dx;
    point[1] += dy;
  });
}

// A stroke whose anchor left the DOM stays where it was last seen on the page.
function placeStroke(
  stroke: RecordingStroke,
  lastOrigins: WeakMap<RecordingStroke, PagePoint>
): Placement | null {
  const { anchor } = stroke;
  if (anchor && !anchor.element.isConnected) {
    const last = lastOrigins.get(stroke);
    if (!last) return null;
    return {
      origin: {
        x: last.x + last.scrollX - window.scrollX,
        y: last.y + last.scrollY - window.scrollY,
      },
      clips: [],
    };
  }
  const origin = anchorOrigin(anchor);
  if (anchor) {
    lastOrigins.set(stroke, { ...origin, scrollX: window.scrollX, scrollY: window.scrollY });
  }
  const clips =
    anchor?.clips
      .filter(({ element }) => element.isConnected)
      .map(({ element, outset }) => expandBox(clientBox(element), outset)) ?? [];
  return { origin, clips };
}

function placementKey(placement: Placement | null): string {
  if (!placement) return '-';
  const { origin, clips } = placement;
  return [
    origin.x,
    origin.y,
    ...clips.flatMap((box) => [box.left, box.top, box.width, box.height]),
  ].join(',');
}

function drawStroke(
  context: CanvasRenderingContext2D,
  { color, points }: RecordingStroke,
  { origin, clips }: Placement
): void {
  context.save();
  clips.forEach((box) => {
    context.beginPath();
    context.rect(box.left, box.top, box.width, box.height);
    context.clip();
  });
  context.translate(origin.x, origin.y);
  context.strokeStyle = color;
  context.lineWidth = PEN_WIDTH;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length - 1; i += 1) {
    const midX = (points[i][0] + points[i + 1][0]) / 2;
    const midY = (points[i][1] + points[i + 1][1]) / 2;
    context.quadraticCurveTo(points[i][0], points[i][1], midX, midY);
  }
  const last = points[points.length - 1];
  context.lineTo(last[0], last[1]);
  context.stroke();
  context.restore();
}

function wheelScale(event: WheelEvent): number {
  if (event.deltaMode === 1) return WHEEL_LINE_PX;
  if (event.deltaMode === 2) return window.innerHeight;
  return 1;
}

// The widget container exposes the configured primary color for the active theme.
function primaryColor(element: Element | null): string {
  const value = element ? getComputedStyle(element).getPropertyValue('--primary').trim() : '';
  return value || RIPPLE_FALLBACK_COLOR;
}

function drawRing(
  context: CanvasRenderingContext2D,
  { x, y }: Point,
  radius: number,
  alpha: number,
  color: string
): void {
  context.save();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  // The dark underlay keeps the ring readable on light and dark pages alike.
  context.lineWidth = 6;
  context.globalAlpha = alpha * 0.35;
  context.strokeStyle = '#000000';
  context.stroke();
  context.lineWidth = 3;
  context.globalAlpha = alpha;
  // A canvas ignores an invalid color, which leaves the fallback in place.
  context.strokeStyle = RIPPLE_FALLBACK_COLOR;
  context.strokeStyle = color;
  context.stroke();
  context.restore();
}

function drawRipple(context: CanvasRenderingContext2D, ripple: Ripple, now: number): void {
  const progress = (now - ripple.start) / RIPPLE_MS;
  const alpha = 1 - progress;
  const eased = ripple.expands ? 1 - (1 - progress) ** 3 : 1;
  drawRing(context, ripple, 6 + eased * 30, alpha, ripple.color);
  if (progress > 0.18) drawRing(context, ripple, 4 + eased * 13, alpha * 0.7, ripple.color);
}

function clearLayer(
  layer: HTMLCanvasElement,
  target: HTMLCanvasElement
): CanvasRenderingContext2D | null {
  if (layer.width !== target.width) layer.width = target.width;
  if (layer.height !== target.height) layer.height = target.height;
  const context = layer.getContext('2d');
  if (!context) return null;
  const ratio = window.devicePixelRatio || 1;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, layer.width, layer.height);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

// The trail fades along its length, so it is drawn as one translucent segment per
// sample. Overlapping round caps or per-segment shadows would double up at every
// joint, so segments meet with butt caps on their own layer and the glow is applied
// to that layer once.
function drawLaser(
  context: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  trail: TrailPoint[],
  head: Point | null,
  now: number
): void {
  const trailContext = trail.length > 1 ? clearLayer(layer, context.canvas) : null;
  if (trailContext) {
    trailContext.lineCap = 'butt';
    trailContext.lineJoin = 'round';
    let start: Point = trail[0];
    for (let i = 1; i < trail.length; i += 1) {
      const previous = trail[i - 1];
      const current = trail[i];
      const end = { x: (previous.x + current.x) / 2, y: (previous.y + current.y) / 2 };
      const life = 1 - (now - trail[i].time) / LASER_TRAIL_MS;
      trailContext.strokeStyle = `rgb(239 68 68 / ${life})`;
      trailContext.lineWidth = 1.5 + life * 4.5;
      trailContext.beginPath();
      trailContext.moveTo(start.x, start.y);
      trailContext.quadraticCurveTo(previous.x, previous.y, end.x, end.y);
      if (i === trail.length - 1) trailContext.lineTo(current.x, current.y);
      trailContext.stroke();
      start = end;
    }
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.shadowColor = LASER_COLOR;
    context.shadowBlur = 10;
    context.drawImage(layer, 0, 0);
    context.restore();
  }

  if (!head) return;
  const glow = context.createRadialGradient(head.x, head.y, 1, head.x, head.y, LASER_GLOW_RADIUS);
  glow.addColorStop(0, 'rgb(239 68 68 / 0.9)');
  glow.addColorStop(1, 'rgb(239 68 68 / 0)');
  context.fillStyle = glow;
  context.beginPath();
  context.arc(head.x, head.y, LASER_GLOW_RADIUS, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = LASER_COLOR;
  context.beginPath();
  context.arc(head.x, head.y, LASER_DOT_RADIUS, 0, Math.PI * 2);
  context.fill();
}

// The widget's own host element is exempt so the recording bar keeps a normal cursor.
function hideHostCursor(): () => void {
  const style = document.createElement('style');
  style.textContent = 'html, html *:not([data-bugpin-exclude]) { cursor: none !important; }';
  document.head.appendChild(style);
  return () => style.remove();
}

const hasColor = ({ backgroundColor }: CSSStyleDeclaration) =>
  !['', 'transparent', 'rgba(0, 0, 0, 0)'].includes(backgroundColor);

const hasImage = ({ backgroundImage }: CSSStyleDeclaration) =>
  !['', 'none'].includes(backgroundImage);

// A restricted capture leaves out the canvas background, so the page's background is
// repeated on an element behind all page content to keep the video from turning black.
function pageBackground(): JSX.CSSProperties {
  const root = getComputedStyle(document.documentElement);
  const source = hasColor(root) || hasImage(root) ? root : getComputedStyle(document.body);
  return {
    backgroundColor: hasColor(source) ? source.backgroundColor : '#ffffff',
    backgroundImage: source.backgroundImage,
    backgroundPosition: source.backgroundPosition,
    backgroundRepeat: source.backgroundRepeat,
    backgroundSize: source.backgroundSize,
  };
}

const isWidgetEvent = (event: Event) =>
  !!(event.target as Element | null)?.closest?.('[data-bugpin-exclude]');

export const RecordingAnnotationLayer: FunctionComponent<RecordingAnnotationLayerProps> = ({
  tool,
  clickEffects,
  color,
  strokes,
  isActive,
  isPaused,
  onStrokeComplete,
}) => {
  const penCanvasRef = useRef<HTMLCanvasElement>(null);
  const effectsCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  // In the top layer the frame stays visible to the reporter while Element Capture
  // leaves it out of the video, like the recording bar.
  useEffect(() => {
    frameRef.current?.showPopover?.();
  }, []);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const activeStrokeRef = useRef<RecordingStroke | null>(null);
  const effectsRef = useRef<EffectsState>({ head: null, trail: [], ripples: [], frame: 0 });
  const laserLayerRef = useRef<HTMLCanvasElement | null>(null);
  const lastOriginsRef = useRef(new WeakMap<RecordingStroke, PagePoint>());
  const layoutKeyRef = useRef('');
  const wheelLatchRef = useRef<WheelLatch | null>(null);
  const hasStrokes = strokes.length > 0;

  // Unforced redraws skip the canvas work when no stroke moved since the last frame.
  const redrawStrokes = useCallback((force = true) => {
    const context = penCanvasRef.current?.getContext('2d');
    if (!context) return;
    const active = activeStrokeRef.current;
    const all = active ? [...strokesRef.current, active] : strokesRef.current;
    const placements = all.map((stroke) => placeStroke(stroke, lastOriginsRef.current));
    const key = placements.map(placementKey).join('|');
    if (!force && key === layoutKeyRef.current) return;
    layoutKeyRef.current = key;
    clearCanvas(context);
    all.forEach((stroke, index) => {
      const placement = placements[index];
      if (placement) drawStroke(context, stroke, placement);
    });
  }, []);

  const wakeEffects = useCallback(() => {
    const effects = effectsRef.current;
    if (effects.frame) return;

    const render = (now: number) => {
      effects.frame = 0;
      const context = effectsCanvasRef.current?.getContext('2d');
      if (!context) return;
      clearCanvas(context);
      effects.ripples = effects.ripples.filter((ripple) => now - ripple.start < RIPPLE_MS);
      effects.ripples.forEach((ripple) => drawRipple(context, ripple, now));
      effects.trail = effects.trail.filter((point) => now - point.time < LASER_TRAIL_MS);
      laserLayerRef.current ??= document.createElement('canvas');
      drawLaser(context, laserLayerRef.current, effects.trail, effects.head, now);
      if (effects.ripples.length || effects.trail.length || effects.head) {
        effects.frame = requestAnimationFrame(render);
      }
    };

    effects.frame = requestAnimationFrame(render);
  }, []);

  useEffect(() => {
    const resize = () => {
      if (penCanvasRef.current) scaleCanvas(penCanvasRef.current);
      if (effectsCanvasRef.current) scaleCanvas(effectsCanvasRef.current);
      redrawStrokes();
    };

    const handleScroll = () => redrawStrokes(false);

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [redrawStrokes]);

  // Anchors also move through layout changes and scrolling that fires no window
  // event, such as inside shadow roots, so placements are checked every frame.
  useEffect(() => {
    if (!hasStrokes) return;
    let frame = 0;
    const watch = () => {
      redrawStrokes(false);
      frame = requestAnimationFrame(watch);
    };
    frame = requestAnimationFrame(watch);
    return () => cancelAnimationFrame(frame);
  }, [hasStrokes, redrawStrokes]);

  useEffect(() => {
    const effects = effectsRef.current;
    return () => {
      if (effects.frame) cancelAnimationFrame(effects.frame);
      effects.frame = 0;
    };
  }, []);

  useEffect(redrawStrokes, [redrawStrokes, strokes]);

  useEffect(() => {
    if (tool !== 'laser') return;

    const effects = effectsRef.current;
    const showHostCursor = hideHostCursor();
    const handlePointerMove = (event: PointerEvent) => {
      if (isWidgetEvent(event)) {
        effects.head = null;
        return;
      }
      effects.head = { x: event.clientX, y: event.clientY };
      const samples = event.getCoalescedEvents?.() ?? [];
      const time = performance.now();
      for (const sample of samples.length ? samples : [event]) {
        effects.trail.push({ x: sample.clientX, y: sample.clientY, time });
      }
      wakeEffects();
    };

    window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, { capture: true });
      effects.head = null;
      showHostCursor();
    };
  }, [tool, wakeEffects]);

  useEffect(() => {
    if (!clickEffects || tool === 'pen') return;

    const handlePointerDown = (event: PointerEvent) => {
      if (isWidgetEvent(event)) return;
      effectsRef.current.ripples.push({
        x: event.clientX,
        y: event.clientY,
        start: performance.now(),
        expands: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        color: primaryColor(effectsCanvasRef.current),
      });
      wakeEffects();
    };

    window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
    return () => window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
  }, [clickEffects, tool, wakeEffects]);

  const handlePenDown = (event: JSX.TargetedPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const element = elementBelowCanvas(event.currentTarget, event.clientX, event.clientY);
    const anchor = element && {
      element,
      followsScroll: true,
      clips: clippingContainersOf(element).map((container) => ({ element: container, outset: 0 })),
    };
    const stroke: RecordingStroke = { color, points: [], anchor };
    releaseExitedClips(stroke, event.clientX, event.clientY);
    const origin = anchorOrigin(stroke.anchor);
    const x = event.clientX - origin.x;
    const y = event.clientY - origin.y;
    stroke.points.push([x, y], [x, y]);
    activeStrokeRef.current = stroke;
    redrawStrokes();
  };

  const handlePenMove = (event: JSX.TargetedPointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    const samples = event.getCoalescedEvents?.() ?? [];
    for (const { clientX, clientY } of samples.length ? samples : [event]) {
      releaseExitedClips(stroke, clientX, clientY);
      const origin = anchorOrigin(stroke.anchor);
      stroke.points.push([clientX - origin.x, clientY - origin.y]);
    }
    redrawStrokes();
  };

  const handlePenUp = () => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    activeStrokeRef.current = null;
    onStrokeComplete(stroke);
  };

  const latchWheel = (event: JSX.TargetedWheelEvent<HTMLCanvasElement>): WheelLatch => {
    const now = performance.now();
    const latch = wheelLatchRef.current;
    if (
      latch &&
      now - latch.time <= WHEEL_LATCH_MS &&
      Math.hypot(event.clientX - latch.clientX, event.clientY - latch.clientY) <=
        WHEEL_LATCH_DISTANCE_PX
    ) {
      latch.time = now;
      return latch;
    }
    const next: WheelLatch = {
      start: elementBelowCanvas(event.currentTarget, event.clientX, event.clientY),
      clientX: event.clientX,
      clientY: event.clientY,
      time: now,
      x: null,
      y: null,
    };
    wheelLatchRef.current = next;
    return next;
  };

  // The pen canvas covers the page, so wheel input is routed to the scroller below it.
  // Each axis chains on its own, and a gesture stays with the scroller it started on.
  const handlePenWheel = (event: JSX.TargetedWheelEvent<HTMLCanvasElement>) => {
    if (event.ctrlKey) return;
    const scale = wheelScale(event);
    const delta: Record<Axis, number> = { x: event.deltaX * scale, y: event.deltaY * scale };
    const latch = latchWheel(event);
    const targets = new Map<Axis, WheelTarget>();
    for (const axis of ['x', 'y'] as const) {
      if (!delta[axis]) continue;
      const target = latch[axis] ?? wheelTarget(latch.start, axis, delta[axis]);
      latch[axis] = target;
      targets.set(axis, target);
    }
    if ([...targets.values()].every((target) => target === 'viewport')) return;

    event.preventDefault();
    const scrolls = new Map<Element | Window, ScrollToOptions>();
    targets.forEach((target, axis) => {
      if (target === 'blocked' || (target === 'viewport' && !viewportScrolls(axis))) return;
      const scroller = target === 'viewport' ? window : target;
      const options = scrolls.get(scroller) ?? { behavior: 'instant' };
      options[axis === 'x' ? 'left' : 'top'] = delta[axis];
      scrolls.set(scroller, options);
    });
    scrolls.forEach((options, scroller) => scroller.scrollBy(options));
  };

  return (
    <>
      {canRestrictCapture() && (
        <div
          data-recording-backdrop
          aria-hidden="true"
          class="pointer-events-none fixed inset-0"
          style={{ ...pageBackground(), zIndex: -2147483648 }}
        />
      )}
      <canvas
        ref={penCanvasRef}
        data-recording-pen
        class={cn(
          LAYER_CLASS,
          'touch-none',
          tool === 'pen' ? 'cursor-crosshair' : 'pointer-events-none'
        )}
        onPointerDown={handlePenDown}
        onPointerMove={handlePenMove}
        onPointerUp={handlePenUp}
        onPointerCancel={handlePenUp}
        onWheel={handlePenWheel}
      />
      <canvas ref={effectsCanvasRef} class={cn(LAYER_CLASS, 'pointer-events-none')} />
      <div
        ref={frameRef}
        data-recording-frame
        aria-hidden="true"
        popover="manual"
        class={cn(
          LAYER_CLASS,
          'pointer-events-none m-0 border-0 bg-transparent p-0',
          !isActive && 'hidden'
        )}
        style={{
          boxShadow: `inset 0 0 0 ${FRAME_WIDTH}px ${isPaused ? FRAME_PAUSED_COLOR : FRAME_COLOR}`,
        }}
      />
    </>
  );
};
