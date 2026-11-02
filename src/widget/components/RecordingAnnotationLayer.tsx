import { FunctionComponent, JSX } from 'preact';
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { canRestrictCapture } from '../capture/recorder';
import type { RecordingStroke, RecordingTool } from '../hooks/use-recording-tools';
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

function drawStroke(context: CanvasRenderingContext2D, { color, points }: RecordingStroke): void {
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
}

function drawRing(
  context: CanvasRenderingContext2D,
  { x, y }: Point,
  radius: number,
  alpha: number
): void {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  // The dark underlay keeps the ring readable on light and dark pages alike.
  context.lineWidth = 6;
  context.strokeStyle = `rgb(0 0 0 / ${alpha * 0.35})`;
  context.stroke();
  context.lineWidth = 3;
  context.strokeStyle = `rgb(46 155 198 / ${alpha})`;
  context.stroke();
}

function drawRipple(context: CanvasRenderingContext2D, ripple: Ripple, now: number): void {
  const progress = (now - ripple.start) / RIPPLE_MS;
  const alpha = 1 - progress;
  const eased = ripple.expands ? 1 - (1 - progress) ** 3 : 1;
  drawRing(context, ripple, 6 + eased * 30, alpha);
  if (progress > 0.18) drawRing(context, ripple, 4 + eased * 13, alpha * 0.7);
}

function drawLaser(
  context: CanvasRenderingContext2D,
  trail: TrailPoint[],
  head: Point | null,
  now: number
): void {
  context.save();
  context.lineCap = 'round';
  context.shadowColor = LASER_COLOR;
  context.shadowBlur = 10;
  for (let i = 1; i < trail.length; i += 1) {
    const life = 1 - (now - trail[i].time) / LASER_TRAIL_MS;
    context.strokeStyle = `rgb(239 68 68 / ${life})`;
    context.lineWidth = 1.5 + life * 4.5;
    context.beginPath();
    context.moveTo(trail[i - 1].x, trail[i - 1].y);
    context.lineTo(trail[i].x, trail[i].y);
    context.stroke();
  }
  context.restore();

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
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const activeStrokeRef = useRef<RecordingStroke | null>(null);
  const effectsRef = useRef<EffectsState>({ head: null, trail: [], ripples: [], frame: 0 });

  const redrawStrokes = useCallback(() => {
    const context = penCanvasRef.current?.getContext('2d');
    if (!context) return;
    clearCanvas(context);
    strokesRef.current.forEach((stroke) => drawStroke(context, stroke));
    if (activeStrokeRef.current) drawStroke(context, activeStrokeRef.current);
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
      drawLaser(context, effects.trail, effects.head, now);
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

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [redrawStrokes]);

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
      effects.trail.push({ ...effects.head, time: performance.now() });
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
    if (!isActive || !clickEffects || tool === 'pen') return;

    const handlePointerDown = (event: PointerEvent) => {
      if (isWidgetEvent(event)) return;
      effectsRef.current.ripples.push({
        x: event.clientX,
        y: event.clientY,
        start: performance.now(),
        expands: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      });
      wakeEffects();
    };

    window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
    return () => window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
  }, [clickEffects, isActive, tool, wakeEffects]);

  const handlePenDown = (event: JSX.TargetedPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const start: [number, number] = [event.clientX, event.clientY];
    activeStrokeRef.current = { color, points: [start, start] };
    redrawStrokes();
  };

  const handlePenMove = (event: JSX.TargetedPointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    const samples = event.getCoalescedEvents?.() ?? [];
    for (const { clientX, clientY } of samples.length ? samples : [event]) {
      stroke.points.push([clientX, clientY]);
    }
    redrawStrokes();
  };

  const handlePenUp = () => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    activeStrokeRef.current = null;
    onStrokeComplete(stroke);
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
      />
      <canvas ref={effectsCanvasRef} class={cn(LAYER_CLASS, 'pointer-events-none')} />
      <div
        data-recording-frame
        aria-hidden="true"
        class={cn(LAYER_CLASS, 'pointer-events-none')}
        style={{
          boxShadow: `inset 0 0 0 ${FRAME_WIDTH}px ${isPaused ? FRAME_PAUSED_COLOR : FRAME_COLOR}`,
        }}
      />
    </>
  );
};
