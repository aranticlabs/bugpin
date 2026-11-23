import { FunctionComponent, JSX } from 'preact';
import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import * as fabric from 'fabric';
import {
  MousePointer2,
  Move,
  Pencil,
  Slash,
  MoveUpRight,
  Square,
  Circle,
  Type,
  HatGlasses,
  Undo2,
  Redo2,
  Trash2,
  ZoomOut,
  ZoomIn,
  Maximize2,
  Minimize2,
} from 'lucide-preact';
import { cn } from '../lib/utils';
import { Button, Tooltip } from '../components/ui';
import { useLocale } from '../hooks/use-locale.js';
import { t } from '../i18n/index.js';
import {
  clampZoom,
  constrainViewport,
  fitViewport,
  panBy,
  sceneScaleFor,
  wheelDeltaPx,
  wheelZoomFactor,
  zoomAtPoint,
  zoomLimits,
  type Size,
  type ViewportPoint,
  type ViewportTransform,
  type ZoomLimits,
} from './viewport';

export type AnnotationTool =
  'select' | 'pan' | 'pen' | 'line' | 'arrow' | 'rectangle' | 'circle' | 'text' | 'pixelate';

interface Point {
  x: number;
  y: number;
}

interface FabricObjectWithStartPoint extends fabric.Object {
  _startPoint?: Point;
}

interface PixelateData {
  type: 'pixelate';
  blockSize: number;
  generationId?: number;
}

interface FabricObjectWithData extends fabric.FabricObject {
  data?: PixelateData;
}

// Fabric v7 changed origin defaults from 'left'/'top' to 'center' — override back
// since all positioning code assumes top-left origin
fabric.FabricObject.ownDefaults.originX = 'left';
fabric.FabricObject.ownDefaults.originY = 'top';

// Extend Fabric serialization to include custom 'data' field (with HMR guard)
const TO_OBJECT_PATCHED = Symbol.for('bugpin-toObject-patched');
if (!(fabric.FabricObject.prototype as unknown as Record<symbol, boolean>)[TO_OBJECT_PATCHED]) {
  const originalToObject = fabric.FabricObject.prototype.toObject;
  fabric.FabricObject.prototype.toObject = function (propertiesToInclude?: string[]) {
    // Deduplicate properties array to avoid duplicates if caller already includes 'data'
    const props = [...new Set(['data', ...(propertiesToInclude || [])])];
    return originalToObject.call(this, props);
  };
  (fabric.FabricObject.prototype as unknown as Record<symbol, boolean>)[TO_OBJECT_PATCHED] = true;
}

interface AnnotationCanvasProps {
  screenshot: string;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  onSave: (annotatedImage: string, annotations: object) => void;
  onCancel: () => void;
}

interface Scene {
  size: Size;
  /** Scene units per screenshot pixel. */
  scale: number;
}

interface ZoomState {
  zoom: number;
  limits: ZoomLimits;
  sceneScale: number;
}

interface PinchState {
  view: Size;
  lastTouches: Touch[];
  startDistance: number;
  startMidpoint: ViewportPoint;
  startViewport: ViewportTransform;
}

/** Safari's non-standard trackpad and touch pinch event. */
interface GestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

/** Fabric internals for abandoning a pointer interaction that a pinch interrupts. */
interface FabricInteractionState {
  _isCurrentlyDrawing?: boolean;
  _groupSelector?: unknown;
  _currentTransform?: {
    target: fabric.FabricObject;
    original: Partial<Record<keyof fabric.FabricObject, unknown>>;
  } | null;
  contextTop?: CanvasRenderingContext2D;
}

const TRANSFORM_KEYS = [
  'left',
  'top',
  'scaleX',
  'scaleY',
  'skewX',
  'skewY',
  'angle',
  'flipX',
  'flipY',
] as const;

const ZOOM_STEP = 1.2;
// Float slack so a zoom clamped to a limit counts as having reached it.
const ZOOM_LIMIT_TOLERANCE = 1.0001;

function preventMouseFocus(e: JSX.TargetedMouseEvent<HTMLButtonElement>): void {
  e.preventDefault();
}

const COLORS = [
  { value: '#ef4444', labelKey: 'annotation.color.red' },
  { value: '#f97316', labelKey: 'annotation.color.orange' },
  { value: '#eab308', labelKey: 'annotation.color.yellow' },
  { value: '#22c55e', labelKey: 'annotation.color.green' },
  { value: '#3b82f6', labelKey: 'annotation.color.blue' },
  { value: '#8b5cf6', labelKey: 'annotation.color.purple' },
  { value: '#000000', labelKey: 'annotation.color.black' },
] as const;
const STROKE_WIDTHS = [2, 4, 6, 8];

// Global generation counter for pixelate race condition prevention
let pixelateGenerationCounter = 0;

// Helper to regenerate pixelation for an object at its current canvas position
function regeneratePixelate(
  canvas: fabric.Canvas,
  obj: fabric.FabricImage,
  bgImage: fabric.FabricImage
): void {
  const objWithData = obj as FabricObjectWithData;

  // Increment and store generation ID to detect stale completions
  const generationId = ++pixelateGenerationCounter;
  if (objWithData.data) {
    objWithData.data.generationId = generationId;
  }

  obj.setCoords();

  // Get current bounds in canvas space
  const bounds = obj.getBoundingRect();
  const left = bounds.left;
  const top = bounds.top;
  const width = bounds.width;
  const height = bounds.height;

  if (width <= 0 || height <= 0) return;

  const bgElement = bgImage.getElement() as HTMLImageElement;
  const scaleX = bgImage.scaleX || 1;
  const scaleY = bgImage.scaleY || 1;

  // Use stored blockSize for consistency, or calculate if not available
  const storedBlockSize = objWithData.data?.blockSize;
  const blockSize = storedBlockSize || Math.max(3, Math.round(Math.min(width, height) / 20));

  // Create temp canvas to extract region
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = Math.ceil(width);
  tempCanvas.height = Math.ceil(height);
  const tempCtx = tempCanvas.getContext('2d');

  if (tempCtx) {
    // Draw the region from the background image at new position
    tempCtx.drawImage(
      bgElement,
      left / scaleX,
      top / scaleY,
      width / scaleX,
      height / scaleY,
      0,
      0,
      tempCanvas.width,
      tempCanvas.height
    );

    // Apply pixelate filter directly to the temp canvas
    const tempFabricImg = new fabric.FabricImage(tempCanvas);
    tempFabricImg.filters = [new fabric.filters.Pixelate({ blocksize: blockSize })];
    tempFabricImg.applyFilters();

    // Get the filtered canvas element
    const filteredElement = tempFabricImg.getElement() as HTMLCanvasElement;

    // Check if this generation is still current (not stale)
    if (objWithData.data?.generationId !== generationId) return;

    // Update the fabric image's element directly with canvas (no async image load needed)
    obj.setElement(filteredElement);

    obj.set({
      scaleX: width / tempCanvas.width,
      scaleY: height / tempCanvas.height,
    });

    // Update metadata (preserve blockSize)
    objWithData.data = { type: 'pixelate', blockSize, generationId };
  }

  canvas.renderAll();
}

export const AnnotationCanvas: FunctionComponent<AnnotationCanvasProps> = ({
  screenshot,
  isMaximized,
  onToggleMaximize,
  onSave,
  onCancel,
}) => {
  useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const [activeTool, setActiveTool] = useState<AnnotationTool>('select');
  const [activeColor, setActiveColor] = useState('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [zoomState, setZoomState] = useState<ZoomState>({
    zoom: 1,
    limits: { min: 1, max: 1 },
    sceneScale: 1,
  });
  const [isPanning, setIsPanning] = useState(false);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const isDrawingRef = useRef(false);
  const isPanningRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const originalDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const viewSizeRef = useRef<Size>({ width: 0, height: 0 });
  // While true, resizing the view refits the scene instead of keeping the user's zoom.
  const isFitRef = useRef(true);
  const gestureActiveRef = useRef(false);

  const applyViewport = useCallback((vpt: ViewportTransform) => {
    const canvas = fabricRef.current;
    const scene = sceneRef.current;
    if (!canvas || !scene) return;
    canvas.setViewportTransform(vpt);
    canvas.requestRenderAll();
    const limits = zoomLimits(viewSizeRef.current, scene.size, scene.scale);
    // Panning keeps the zoom, so skip the re-render unless something shown changes.
    setZoomState((previous) =>
      previous.zoom === vpt[0] &&
      previous.sceneScale === scene.scale &&
      previous.limits.min === limits.min &&
      previous.limits.max === limits.max
        ? previous
        : { zoom: vpt[0], limits, sceneScale: scene.scale }
    );
  }, []);

  /** Applies a user zoom or pan; one that changes nothing keeps the view fitted. */
  const moveViewport = useCallback(
    (next: ViewportTransform) => {
      const current = fabricRef.current?.viewportTransform;
      if (current && next.every((value, index) => value === current[index])) return;
      isFitRef.current = false;
      applyViewport(next);
    },
    [applyViewport]
  );

  const fitToView = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    isFitRef.current = true;
    applyViewport(fitViewport(viewSizeRef.current, scene.size));
  }, [applyViewport]);

  const zoomTo = useCallback(
    (zoom: number, point: ViewportPoint) => {
      const canvas = fabricRef.current;
      const scene = sceneRef.current;
      if (!canvas || !scene) return;
      const view = viewSizeRef.current;
      const limits = zoomLimits(view, scene.size, scene.scale);
      const vpt = canvas.viewportTransform as ViewportTransform;
      moveViewport(
        constrainViewport(zoomAtPoint(vpt, point, clampZoom(zoom, limits)), view, scene.size)
      );
    },
    [moveViewport]
  );

  const panViewport = useCallback(
    (dx: number, dy: number) => {
      const canvas = fabricRef.current;
      const scene = sceneRef.current;
      if (!canvas || !scene) return;
      const vpt = canvas.viewportTransform as ViewportTransform;
      moveViewport(constrainViewport(panBy(vpt, dx, dy), viewSizeRef.current, scene.size));
    },
    [moveViewport]
  );

  const measureView = useCallback((): Size => {
    const wrapper = canvasWrapperRef.current;
    return { width: wrapper?.clientWidth ?? 0, height: wrapper?.clientHeight ?? 0 };
  }, []);

  // Initialize Fabric.js canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      isDrawingMode: false,
      selection: true,
    });
    fabricRef.current = canvas;
    viewSizeRef.current = measureView();
    canvas.setDimensions(viewSizeRef.current);

    // Load screenshot as background
    fabric.FabricImage.fromURL(screenshot).then((img) => {
      const original = { width: img.width || 800, height: img.height || 600 };
      originalDimensionsRef.current = original;

      const scale = sceneScaleFor(viewSizeRef.current, original);
      sceneRef.current = {
        size: { width: original.width * scale, height: original.height * scale },
        scale,
      };

      img.set({ scaleX: scale, scaleY: scale });
      canvas.backgroundImage = img;
      // Only the screenshot is exported, so hide anything drawn past its edges.
      canvas.clipPath = new fabric.Rect({
        left: 0,
        top: 0,
        width: original.width * scale,
        height: original.height * scale,
        strokeWidth: 0,
        absolutePositioned: true,
      });
      fitToView();

      // Save initial state
      saveToHistory();
    });

    // Ctrl/Cmd + wheel (and trackpad pinch, which browsers report the same way) zooms
    // around the pointer; a plain wheel pans.
    canvas.on('mouse:wheel', (opt) => {
      const e = opt.e as WheelEvent;
      e.preventDefault();
      if (gestureActiveRef.current) return;
      const mode = e.deltaMode;
      const view = viewSizeRef.current;
      const horizontal = e.shiftKey && e.deltaX === 0 && !e.ctrlKey && !e.metaKey;
      const dy = wheelDeltaPx(e.deltaY, mode, horizontal ? view.width : view.height);
      if (e.ctrlKey || e.metaKey) {
        zoomTo(canvas.getZoom() * wheelZoomFactor(dy), canvas.getViewportPoint(e));
        return;
      }
      const dx = wheelDeltaPx(e.deltaX, mode, view.width);
      // Windows reports shift + wheel as vertical delta with shiftKey set.
      if (horizontal) panViewport(-dy, 0);
      else panViewport(-dx, -dy);
    });

    // Set up drawing brush
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = activeColor;
    canvas.freeDrawingBrush.width = strokeWidth;

    // Save history after pen strokes complete
    canvas.on('path:created', () => {
      saveToHistory();
    });

    // Re-pixelate regions when they are moved or resized
    canvas.on('object:modified', (e) => {
      const obj = e.target as FabricObjectWithData;
      if (
        obj?.data?.type === 'pixelate' &&
        obj instanceof fabric.FabricImage &&
        canvas.backgroundImage
      ) {
        regeneratePixelate(canvas, obj, canvas.backgroundImage as fabric.FabricImage);
        saveToHistory();
      }
    });

    // Prevent browser context menu on right-click (for right-click pan)
    const canvasEl = canvasRef.current;
    const preventContextMenu = (e: Event) => e.preventDefault();
    canvasEl?.addEventListener('contextmenu', preventContextMenu);

    return () => {
      canvasEl?.removeEventListener('contextmenu', preventContextMenu);
      canvas.dispose();
    };
  }, [screenshot]);

  // Keep the canvas filling the work area; refit, or keep the user's zoom centered.
  useEffect(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const previous = viewSizeRef.current;
      const view = measureView();
      if (view.width === previous.width && view.height === previous.height) return;

      viewSizeRef.current = view;
      canvas.setDimensions(view);
      const scene = sceneRef.current;
      if (!scene) return;
      if (isFitRef.current) {
        fitToView();
        return;
      }
      const vpt = canvas.viewportTransform as ViewportTransform;
      const shifted = panBy(
        vpt,
        (view.width - previous.width) / 2,
        (view.height - previous.height) / 2
      );
      const zoom = clampZoom(shifted[0], zoomLimits(view, scene.size, scene.scale));
      const center = { x: view.width / 2, y: view.height / 2 };
      applyViewport(constrainViewport(zoomAtPoint(shifted, center, zoom), view, scene.size));
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [applyViewport, fitToView, measureView]);

  // Two-finger pinch on touch screens and Safari's gesture events. Touch events are
  // intercepted in the capture phase so Fabric never sees the second finger; whatever the
  // first finger started is cancelled, and the final touchend still reaches Fabric so it
  // can release its document listeners.
  useEffect(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;

    let pinch: PinchState | null = null;
    let touchSessionBlocked = false;
    // Objects that existed before the first finger landed; anything newer is undone if
    // the touch turns into a pinch.
    let objectsBeforeTouch: Set<fabric.FabricObject> | null = null;
    let gestureStart: { zoom: number } | null = null;

    const toViewportPoint = (clientX: number, clientY: number): ViewportPoint => {
      const rect = wrapper.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    // Only fingers that landed on the canvas take part in drawing and pinching; a finger
    // resting on the toolbar or the zoom controls must not turn a drawing gesture into a pinch.
    const canvasTouches = (touches: TouchList): Touch[] =>
      Array.from(touches).filter(
        (touch) =>
          !(touch.target instanceof Node) ||
          (canvasHostRef.current ?? wrapper).contains(touch.target)
      );

    const readPinch = (touches: Touch[]) => {
      const [a, b] = [touches[0], touches[1]];
      return {
        distance: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
        midpoint: toViewportPoint((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2),
      };
    };

    const cancelPointerInteraction = () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const drawingCanvas = canvas as unknown as { _drawingShape?: fabric.FabricObject };
      if (isDrawingRef.current && drawingCanvas._drawingShape) {
        canvas.remove(drawingCanvas._drawingShape);
      }
      drawingCanvas._drawingShape = undefined;
      isDrawingRef.current = false;

      const before = objectsBeforeTouch;
      if (before) {
        canvas
          .getObjects()
          .filter((obj) => !before.has(obj))
          .forEach((obj) => {
            if (obj instanceof fabric.IText && obj.isEditing) obj.exitEditing();
            if (canvas.getActiveObject() === obj) canvas.discardActiveObject();
            canvas.remove(obj);
          });
      }

      const internals = canvas as unknown as FabricInteractionState;
      const transform = internals._currentTransform;
      if (transform) {
        const restored: Record<string, unknown> = {};
        TRANSFORM_KEYS.forEach((key) => {
          if (key in transform.original) restored[key] = transform.original[key];
        });
        transform.target.set(restored);
        transform.target.setCoords();
        internals._currentTransform = null;
      }
      internals._groupSelector = null;
      internals._isCurrentlyDrawing = false;
      if (internals.contextTop) canvas.clearContext(internals.contextTop);
      canvas.requestRenderAll();
    };

    const startPinch = (touches: Touch[]) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const { distance, midpoint } = readPinch(touches);
      pinch = {
        view: viewSizeRef.current,
        lastTouches: touches,
        startDistance: Math.max(distance, 1),
        startMidpoint: midpoint,
        startViewport: [...(canvas.viewportTransform as ViewportTransform)],
      };
    };

    const handleTouchStart = (e: TouchEvent) => {
      const touches = canvasTouches(e.touches);
      if (touches.length === 1 && !touchSessionBlocked && objectsBeforeTouch === null) {
        objectsBeforeTouch = new Set(fabricRef.current?.getObjects() ?? []);
        return;
      }
      if (touches.length < 2) return;
      e.preventDefault();
      e.stopPropagation();
      if (!touchSessionBlocked) {
        touchSessionBlocked = true;
        cancelPointerInteraction();
      }
      startPinch(touches);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchSessionBlocked) return;
      e.preventDefault();
      e.stopPropagation();
      const scene = sceneRef.current;
      const touches = canvasTouches(e.touches);
      if (!pinch || touches.length < 2 || !scene) return;

      if (pinch.view !== viewSizeRef.current) startPinch(pinch.lastTouches);
      pinch.lastTouches = touches;
      const { distance, midpoint } = readPinch(touches);
      const start = pinch.startViewport;
      const view = viewSizeRef.current;
      const zoom = clampZoom(
        start[0] * (distance / pinch.startDistance),
        zoomLimits(view, scene.size, scene.scale)
      );
      // Keep the scene point that was under the starting midpoint under the current one,
      // so moving both fingers pans while spreading them zooms.
      const sceneX = (pinch.startMidpoint.x - start[4]) / start[0];
      const sceneY = (pinch.startMidpoint.y - start[5]) / start[3];
      const vpt: ViewportTransform = [
        zoom,
        0,
        0,
        zoom,
        midpoint.x - sceneX * zoom,
        midpoint.y - sceneY * zoom,
      ];
      moveViewport(constrainViewport(vpt, view, scene.size));
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touches = canvasTouches(e.touches);
      if (touches.length === 0) {
        // The gesture is over, so a later pinch must not undo what it drew.
        touchSessionBlocked = false;
        pinch = null;
        objectsBeforeTouch = null;
        return;
      }
      if (!touchSessionBlocked) return;
      e.stopPropagation();
      if (touches.length >= 2) startPinch(touches);
      else pinch = null;
    };

    const handleTouchCancel = (e: TouchEvent) => {
      const canvas = fabricRef.current;
      if (canvas?.mainTouchId !== undefined && e.touches.length === 0) {
        cancelPointerInteraction();
        // Fabric only tears down its document listeners and restores mouse input on touchend.
        canvas._onTouchEnd(e);
      }
      if (e.touches.length === 0) handleTouchEnd(e);
    };

    const handleGestureStart = (e: Event) => {
      e.preventDefault();
      gestureActiveRef.current = true;
      gestureStart = { zoom: fabricRef.current?.getZoom() ?? 1 };
    };

    const handleGestureChange = (e: Event) => {
      e.preventDefault();
      if (touchSessionBlocked || !gestureStart) return;
      const gesture = e as GestureEvent;
      const point = Number.isFinite(gesture.clientX)
        ? toViewportPoint(gesture.clientX, gesture.clientY)
        : { x: viewSizeRef.current.width / 2, y: viewSizeRef.current.height / 2 };
      zoomTo(gestureStart.zoom * gesture.scale, point);
    };

    const handleGestureEnd = (e: Event) => {
      e.preventDefault();
      gestureActiveRef.current = false;
      gestureStart = null;
    };

    const capture = { capture: true, passive: false };
    wrapper.addEventListener('touchstart', handleTouchStart, capture);
    wrapper.addEventListener('touchmove', handleTouchMove, capture);
    wrapper.addEventListener('touchend', handleTouchEnd, capture);
    wrapper.addEventListener('touchcancel', handleTouchEnd, capture);
    document.addEventListener('touchcancel', handleTouchCancel, capture);
    wrapper.addEventListener('gesturestart', handleGestureStart);
    wrapper.addEventListener('gesturechange', handleGestureChange);
    wrapper.addEventListener('gestureend', handleGestureEnd);
    return () => {
      wrapper.removeEventListener('touchstart', handleTouchStart, capture);
      wrapper.removeEventListener('touchmove', handleTouchMove, capture);
      wrapper.removeEventListener('touchend', handleTouchEnd, capture);
      wrapper.removeEventListener('touchcancel', handleTouchEnd, capture);
      document.removeEventListener('touchcancel', handleTouchCancel, capture);
      wrapper.removeEventListener('gesturestart', handleGestureStart);
      wrapper.removeEventListener('gesturechange', handleGestureChange);
      wrapper.removeEventListener('gestureend', handleGestureEnd);
    };
  }, [moveViewport, zoomTo]);

  // Update brush when color/width changes
  useEffect(() => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;

    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = activeColor;
      canvas.freeDrawingBrush.width = strokeWidth;
    }
  }, [activeColor, strokeWidth]);

  // Update drawing mode based on active tool
  useEffect(() => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;

    canvas.isDrawingMode = activeTool === 'pen';
    canvas.selection = activeTool === 'select';

    // Set cursor based on tool
    if (activeTool === 'select') {
      canvas.defaultCursor = 'default';
    } else if (activeTool === 'pan') {
      canvas.defaultCursor = 'grab';
    } else if (activeTool === 'pen') {
      canvas.defaultCursor = 'crosshair';
    } else {
      canvas.defaultCursor = 'crosshair';
    }

    // Update isPanning state based on pan tool
    setIsPanning(activeTool === 'pan');
  }, [activeTool]);

  const saveToHistory = useCallback(() => {
    if (!fabricRef.current) return;

    const json = JSON.stringify(fabricRef.current.toJSON());

    // Remove any future history if we're not at the end
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);

    historyRef.current.push(json);
    historyIndexRef.current = historyRef.current.length - 1;

    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    if (!fabricRef.current || historyIndexRef.current <= 0) return;

    historyIndexRef.current--;
    const json = historyRef.current[historyIndexRef.current];

    fabricRef.current.loadFromJSON(JSON.parse(json)).then(() => {
      fabricRef.current?.renderAll();
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
    });
  }, []);

  const redo = useCallback(() => {
    if (!fabricRef.current || historyIndexRef.current >= historyRef.current.length - 1) return;

    historyIndexRef.current++;
    const json = historyRef.current[historyIndexRef.current];

    fabricRef.current.loadFromJSON(JSON.parse(json)).then(() => {
      fabricRef.current?.renderAll();
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
    });
  }, []);

  // Handle shape drawing
  const handleCanvasMouseDown = useCallback(
    (e: fabric.TPointerEventInfo) => {
      if (
        !fabricRef.current ||
        activeTool === 'pen' ||
        activeTool === 'select' ||
        activeTool === 'pan'
      )
        return;

      // Don't start drawing if clicking on an existing object (allow moving/selecting instead)
      // Use findTarget for robustness with group selection and disabled selection states
      if (e.target || fabricRef.current?.findTarget(e.e as MouseEvent).target) return;

      isDrawingRef.current = true;
      const canvas = fabricRef.current;
      const pointer = e.scenePoint;

      let shape: fabric.FabricObject | null = null;

      switch (activeTool) {
        case 'rectangle':
          shape = new fabric.Rect({
            left: pointer.x,
            top: pointer.y,
            width: 0,
            height: 0,
            stroke: activeColor,
            strokeWidth: strokeWidth,
            fill: 'transparent',
            selectable: false, // Disable during drawing
            hasControls: false,
            hasBorders: false,
          });
          break;

        case 'circle':
          shape = new fabric.Ellipse({
            left: pointer.x,
            top: pointer.y,
            rx: 0,
            ry: 0,
            stroke: activeColor,
            strokeWidth: strokeWidth,
            fill: 'transparent',
            selectable: false, // Disable during drawing
            hasControls: false,
            hasBorders: false,
          });
          break;

        case 'line':
          shape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke: activeColor,
            strokeWidth: strokeWidth,
            selectable: false, // Disable during drawing
            hasControls: false,
            hasBorders: false,
          });
          break;

        case 'arrow':
          // Create arrow as a group with line and arrowhead
          // Initially just a point, will be updated in mouse move
          shape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke: activeColor,
            strokeWidth: strokeWidth,
            selectable: false,
            hasControls: false,
            hasBorders: false,
          });
          // Mark as arrow for special handling in mouse move/up
          (shape as fabric.FabricObject & { _isArrow?: boolean })._isArrow = true;
          break;

        case 'text': {
          // Text started in the margin around the screenshot would be clipped out of view
          // while still in edit mode and catching keystrokes.
          const size = sceneRef.current?.size;
          if (
            size &&
            (pointer.x < 0 || pointer.y < 0 || pointer.x > size.width || pointer.y > size.height)
          ) {
            isDrawingRef.current = false;
            return;
          }
          shape = new fabric.IText(t('annotation.defaultText'), {
            left: pointer.x,
            top: pointer.y,
            fontSize: 20,
            fill: activeColor,
            selectable: true,
            editable: true,
          });
          canvas.add(shape);
          canvas.setActiveObject(shape);
          (shape as fabric.IText).enterEditing();
          isDrawingRef.current = false;
          return;
        }

        case 'pixelate':
          // Create placeholder rect during drawing, will be replaced with pixelated image on mouse up
          shape = new fabric.Rect({
            left: pointer.x,
            top: pointer.y,
            width: 0,
            height: 0,
            fill: 'rgba(128, 128, 128, 0.3)',
            stroke: '#666',
            strokeWidth: 1,
            strokeDashArray: [5, 5],
            selectable: false,
            hasControls: false,
            hasBorders: false,
          });
          break;
      }

      if (shape) {
        (shape as FabricObjectWithStartPoint)._startPoint = { x: pointer.x, y: pointer.y };
        canvas.add(shape);
        // Store reference for mouse move tracking without making it visually active
        (canvas as unknown as { _drawingShape: fabric.FabricObject })._drawingShape = shape;
      }
    },
    [activeTool, activeColor, strokeWidth]
  );

  const handleCanvasMouseMove = useCallback((e: fabric.TPointerEventInfo) => {
    if (!fabricRef.current || !isDrawingRef.current) return;

    const canvas = fabricRef.current;
    const drawingShape = (canvas as unknown as { _drawingShape?: FabricObjectWithStartPoint })
      ._drawingShape;
    if (!drawingShape || !drawingShape._startPoint) return;

    const pointer = e.scenePoint;
    const startPoint = drawingShape._startPoint;

    if (drawingShape instanceof fabric.Rect) {
      const width = pointer.x - startPoint.x;
      const height = pointer.y - startPoint.y;

      drawingShape.set({
        left: width > 0 ? startPoint.x : pointer.x,
        top: height > 0 ? startPoint.y : pointer.y,
        width: Math.abs(width),
        height: Math.abs(height),
      });
    } else if (drawingShape instanceof fabric.Ellipse) {
      const rx = Math.abs(pointer.x - startPoint.x) / 2;
      const ry = Math.abs(pointer.y - startPoint.y) / 2;

      drawingShape.set({
        left: Math.min(startPoint.x, pointer.x),
        top: Math.min(startPoint.y, pointer.y),
        rx,
        ry,
      });
    } else if (drawingShape instanceof fabric.Line) {
      drawingShape.set({
        x2: pointer.x,
        y2: pointer.y,
      });
    }

    canvas.renderAll();
  }, []);

  const handleCanvasMouseUp = useCallback(async () => {
    if (isDrawingRef.current && fabricRef.current) {
      isDrawingRef.current = false;
      const canvas = fabricRef.current;
      const drawingShape = (canvas as unknown as { _drawingShape?: FabricObjectWithStartPoint })
        ._drawingShape;

      if (drawingShape) {
        // Check if this is a pixelate/blur operation
        const isPixelateShape = activeTool === 'pixelate' && drawingShape instanceof fabric.Rect;

        if (isPixelateShape && canvas.backgroundImage) {
          const rect = drawingShape as fabric.Rect;

          const currentZoom = canvas.getZoom();
          rect.setCoords();

          const { left, top, width, height } = rect;

          // Only create pixelated region if it has meaningful size
          if (rect.width * currentZoom > 5 && rect.height * currentZoom > 5) {
            // Get the background image
            const bgImage = canvas.backgroundImage as fabric.FabricImage;
            const bgElement = bgImage.getElement() as HTMLImageElement;

            // Calculate scale factor between canvas and original image
            const scaleX = bgImage.scaleX || 1;
            const scaleY = bgImage.scaleY || 1;

            // Create temp canvas to extract region at canvas resolution
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = Math.ceil(width);
            tempCanvas.height = Math.ceil(height);
            const tempCtx = tempCanvas.getContext('2d');

            if (tempCtx) {
              // Draw the region from the original image
              tempCtx.drawImage(
                bgElement,
                left / scaleX,
                top / scaleY,
                width / scaleX,
                height / scaleY,
                0,
                0,
                tempCanvas.width,
                tempCanvas.height
              );

              // Apply pixelate filter - smaller blocks for finer pixelation
              const blockSize = Math.max(3, Math.round(Math.min(width, height) / 20));

              // Create Fabric image from extracted region with metadata
              const regionImage = new fabric.FabricImage(tempCanvas, {
                left,
                top,
                scaleX: width / tempCanvas.width,
                scaleY: height / tempCanvas.height,
                selectable: true,
                hasControls: true,
                hasBorders: true,
              });

              // Store metadata for identification
              (regionImage as fabric.FabricObject & { data?: Record<string, unknown> }).data = {
                type: 'pixelate',
                blockSize,
              };

              regionImage.filters = [new fabric.filters.Pixelate({ blocksize: blockSize })];
              regionImage.applyFilters();

              // Remove placeholder rect and add pixelated image
              canvas.remove(rect);
              canvas.add(regionImage);
            }
          } else {
            // Too small, just remove the placeholder
            canvas.remove(rect);
          }

          canvas.renderAll();
        } else if (
          (drawingShape as fabric.FabricObject & { _isArrow?: boolean })._isArrow &&
          drawingShape instanceof fabric.Line
        ) {
          // Convert arrow line to arrow with arrowhead
          const line = drawingShape;
          const x1 = line.x1 || 0;
          const y1 = line.y1 || 0;
          const x2 = line.x2 || 0;
          const y2 = line.y2 || 0;

          // Calculate arrow length
          const dx = x2 - x1;
          const dy = y2 - y1;
          const length = Math.sqrt(dx * dx + dy * dy);

          // Only create arrowhead if line has meaningful length
          if (length > 10) {
            const angle = Math.atan2(dy, dx);
            const lineStroke = line.strokeWidth || 2;
            // Scale arrowhead with stroke width for consistent appearance
            // headLength = distance from tip to base, headWidth = half-width of base
            const headLength = Math.max(lineStroke * 5, Math.min(lineStroke * 7, length / 3));
            const headWidth = headLength * 0.35; // Narrow base for pointier arrow

            // Arrowhead base point (where the line should end)
            const headX = x2 - headLength * Math.cos(angle);
            const headY = y2 - headLength * Math.sin(angle);
            // Wing points of the arrowhead
            const leftX = headX - headWidth * Math.cos(angle - Math.PI / 2);
            const leftY = headY - headWidth * Math.sin(angle - Math.PI / 2);
            const rightX = headX - headWidth * Math.cos(angle + Math.PI / 2);
            const rightY = headY - headWidth * Math.sin(angle + Math.PI / 2);

            // Shorten line to end at the base of the arrowhead (not the tip)
            line.set({ x2: headX, y2: headY });

            // Create arrowhead triangle
            const arrowhead = new fabric.Polygon(
              [
                { x: x2, y: y2 },
                { x: leftX, y: leftY },
                { x: rightX, y: rightY },
              ],
              {
                fill: line.stroke,
                stroke: line.stroke,
                strokeWidth: 1,
                selectable: false,
              }
            );

            // Create a group with line and arrowhead
            const arrow = new fabric.Group([line, arrowhead], {
              selectable: true,
              hasControls: true,
              hasBorders: true,
            });

            // Remove original line and add group
            canvas.remove(line);
            canvas.add(arrow);
          } else {
            // Too short, just enable selection on the line
            drawingShape.set({
              selectable: true,
              hasControls: true,
              hasBorders: true,
            });
          }
        } else {
          // Re-enable selection controls for non-pixelate shapes
          drawingShape.set({
            selectable: true,
            hasControls: true,
            hasBorders: true,
          });
        }

        // Clear the drawing reference
        (canvas as unknown as { _drawingShape?: fabric.FabricObject })._drawingShape = undefined;
      }

      saveToHistory();
    }
  }, [saveToHistory, activeTool]);

  // Set up mouse event handlers
  useEffect(() => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;

    canvas.on('mouse:down', handleCanvasMouseDown);
    canvas.on('mouse:move', handleCanvasMouseMove);
    canvas.on('mouse:up', handleCanvasMouseUp);

    return () => {
      canvas.off('mouse:down', handleCanvasMouseDown);
      canvas.off('mouse:move', handleCanvasMouseMove);
      canvas.off('mouse:up', handleCanvasMouseUp);
    };
  }, [handleCanvasMouseDown, handleCanvasMouseMove, handleCanvasMouseUp]);

  const handleSave = useCallback(() => {
    if (!fabricRef.current) {
      onSave(screenshot, { objects: [] });
      return;
    }

    const canvas = fabricRef.current;

    // Save current zoom and viewport state
    const currentZoom = canvas.getZoom();
    const currentViewport = canvas.viewportTransform?.slice() || [1, 0, 0, 1, 0, 0];

    // Reset zoom and viewport to export full image (not just zoomed area)
    canvas.setZoom(1);
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.renderAll();

    // Calculate multiplier to export at original resolution
    const originalDimensions = originalDimensionsRef.current;
    const scene = sceneRef.current;
    const multiplier = scene ? 1 / scene.scale : 1;

    // Regenerate pixelate patches at export resolution for crisp redaction
    const pixelateObjects: {
      obj: fabric.FabricImage;
      originalElement: HTMLCanvasElement | HTMLImageElement;
      originalState: {
        width: number;
        height: number;
        scaleX: number;
        scaleY: number;
        left: number;
        top: number;
        angle: number;
        skewX: number;
        skewY: number;
        flipX: boolean;
        flipY: boolean;
      };
    }[] = [];

    if (canvas.backgroundImage && multiplier > 1) {
      const bgImage = canvas.backgroundImage as fabric.FabricImage;
      const bgElement = bgImage.getElement() as HTMLImageElement;
      const bgScaleX = bgImage.scaleX || 1;
      const bgScaleY = bgImage.scaleY || 1;

      canvas.getObjects().forEach((obj) => {
        const objWithData = obj as FabricObjectWithData;
        if (objWithData.data?.type === 'pixelate' && obj instanceof fabric.FabricImage) {
          // Save original element and full transform state for restoration
          const originalElement = obj.getElement() as HTMLCanvasElement | HTMLImageElement;
          const originalState = {
            width: obj.width || 0,
            height: obj.height || 0,
            scaleX: obj.scaleX || 1,
            scaleY: obj.scaleY || 1,
            left: obj.left || 0,
            top: obj.top || 0,
            angle: obj.angle || 0,
            skewX: obj.skewX || 0,
            skewY: obj.skewY || 0,
            flipX: obj.flipX || false,
            flipY: obj.flipY || false,
          };
          pixelateObjects.push({ obj, originalElement, originalState });

          // Get bounds and regenerate at export resolution
          obj.setCoords();
          const bounds = obj.getBoundingRect();
          const exportWidth = Math.max(1, Math.ceil(bounds.width * multiplier));
          const exportHeight = Math.max(1, Math.ceil(bounds.height * multiplier));

          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = exportWidth;
          tempCanvas.height = exportHeight;
          const tempCtx = tempCanvas.getContext('2d');

          if (tempCtx) {
            // Draw at export resolution from original image
            tempCtx.drawImage(
              bgElement,
              bounds.left / bgScaleX,
              bounds.top / bgScaleY,
              bounds.width / bgScaleX,
              bounds.height / bgScaleY,
              0,
              0,
              exportWidth,
              exportHeight
            );

            // Use stored blockSize scaled to export resolution, or calculate
            const storedBlockSize =
              objWithData.data?.blockSize ||
              Math.max(3, Math.round(Math.min(bounds.width, bounds.height) / 20));
            const exportBlockSize = Math.round(storedBlockSize * multiplier);

            const exportImg = new fabric.FabricImage(tempCanvas);
            exportImg.filters = [new fabric.filters.Pixelate({ blocksize: exportBlockSize })];
            exportImg.applyFilters();

            // Update the object's element for export (canvas element, not image)
            obj.setElement(exportImg.getElement() as HTMLCanvasElement);
            obj.set({
              width: exportWidth,
              height: exportHeight,
              scaleX: bounds.width / exportWidth,
              scaleY: bounds.height / exportHeight,
            });
          }
        }
      });
      canvas.renderAll();
    }

    // Export exactly the screenshot's area at its original resolution. Zooming the viewport
    // instead of passing a multiplier keeps the output size an exact integer.
    canvas.setViewportTransform([multiplier, 0, 0, multiplier, 0, 0]);
    const dataUrl = canvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 1,
      left: 0,
      top: 0,
      width: originalDimensions?.width ?? canvas.width,
      height: originalDimensions?.height ?? canvas.height,
    });

    // Restore pixelate objects to canvas resolution (synchronous, no onload needed)
    pixelateObjects.forEach(({ obj, originalElement, originalState }) => {
      obj.setElement(originalElement);
      obj.set(originalState);
    });

    // Restore zoom and viewport
    canvas.setZoom(currentZoom);
    canvas.setViewportTransform(
      currentViewport as [number, number, number, number, number, number]
    );
    canvas.renderAll();

    // Get annotations as JSON (excluding background)
    const objects = canvas.getObjects();
    const annotations = objects.map((obj) => obj.toObject());

    onSave(dataUrl, { objects: annotations });
  }, [onSave]);

  const deleteSelected = useCallback(() => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;
    const activeObjects = canvas.getActiveObjects();

    if (activeObjects.length > 0) {
      activeObjects.forEach((obj) => canvas.remove(obj));
      canvas.discardActiveObject();
      canvas.renderAll();
      saveToHistory();
    }
  }, [saveToHistory]);

  const viewCenter = (): ViewportPoint => ({
    x: viewSizeRef.current.width / 2,
    y: viewSizeRef.current.height / 2,
  });

  const handleZoomIn = useCallback(() => {
    zoomTo(zoomState.zoom * ZOOM_STEP, viewCenter());
  }, [zoomState.zoom, zoomTo]);

  const handleZoomOut = useCallback(() => {
    zoomTo(zoomState.zoom / ZOOM_STEP, viewCenter());
  }, [zoomState.zoom, zoomTo]);

  // Panning functionality (hold Space to pan)
  useEffect(() => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;

    const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
      const evt = opt.e as MouseEvent;
      if (
        evt.buttons === 2 ||
        (evt.buttons === 1 && isPanning) ||
        (evt.buttons === 1 && activeTool === 'pan')
      ) {
        // Right click or left click while panning mode or pan tool selected
        evt.preventDefault();
        isPanningRef.current = true;
        canvas.selection = false;
        lastPosRef.current = { x: evt.clientX, y: evt.clientY };
        canvas.setCursor('grabbing');
      }
    };

    const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
      if (isPanningRef.current && lastPosRef.current) {
        const evt = opt.e as MouseEvent;
        panViewport(evt.clientX - lastPosRef.current.x, evt.clientY - lastPosRef.current.y);
        lastPosRef.current = { x: evt.clientX, y: evt.clientY };
      }
    };

    const handleMouseUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        lastPosRef.current = null;
        canvas.setCursor(isPanning || activeTool === 'pan' ? 'grab' : 'default');
        // Restore selection state based on active tool
        canvas.selection = activeTool === 'select';
      }
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [isPanning, activeTool, panViewport]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const activeObject = fabricRef.current?.getActiveObject();
      const isEditingFabricText = activeObject instanceof fabric.IText && activeObject.isEditing;
      const isEditingHtmlField =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable);

      // Do not let canvas shortcuts intercept normal typing in annotation text or form fields.
      if (isEditingFabricText || isEditingHtmlField) {
        return;
      }

      // Space key for pan mode
      if (
        e.key === ' ' &&
        !isPanning &&
        !e
          .composedPath()
          .some(
            (target) =>
              target instanceof HTMLElement &&
              target.matches('button, input, textarea, select, [contenteditable="true"]')
          )
      ) {
        e.preventDefault();
        setIsPanning(true);
        if (fabricRef.current) {
          fabricRef.current.setCursor('grab');
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Release space key
      if (e.key === ' ' && isPanning) {
        setIsPanning(false);
        if (fabricRef.current) {
          // Keep grab cursor if pan tool is selected, otherwise reset to default
          fabricRef.current.setCursor(activeTool === 'pan' ? 'grab' : 'default');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [deleteSelected, undo, redo, isPanning, activeTool]);

  const ToolButton = ({
    tool,
    icon,
    label,
  }: {
    tool: AnnotationTool;
    icon: JSX.Element;
    label: string;
  }) => (
    <Tooltip content={label} side="bottom">
      <button
        class={cn(
          'flex items-center justify-center w-8 h-8 border-none rounded bg-transparent text-muted-foreground cursor-pointer transition-colors',
          'hover:bg-foreground/10 hover:text-foreground',
          '[&_svg]:w-4.5 [&_svg]:h-4.5',
          activeTool === tool && 'bg-primary/10 text-primary'
        )}
        onMouseDown={preventMouseFocus}
        onClick={() => setActiveTool(tool)}
        aria-label={label}
      >
        {icon}
      </button>
    </Tooltip>
  );

  return (
    <div class="h-full min-h-0 flex flex-col">
      {/* Toolbar */}
      <div class="shrink-0 flex items-start gap-2 px-4 py-3 border-b border-solid border-border bg-muted">
        <div class="flex flex-1 min-w-0 flex-wrap items-center gap-2">
          <div class="flex flex-wrap items-center gap-1">
            <ToolButton
              tool="select"
              label={t('annotation.toolbar.select')}
              icon={<MousePointer2 />}
            />
            <ToolButton tool="pan" label={t('annotation.toolbar.pan')} icon={<Move />} />
            <ToolButton tool="pen" label={t('annotation.toolbar.pen')} icon={<Pencil />} />
            <ToolButton tool="line" label={t('annotation.toolbar.line')} icon={<Slash />} />
            <ToolButton tool="arrow" label={t('annotation.toolbar.arrow')} icon={<MoveUpRight />} />
            <ToolButton
              tool="rectangle"
              label={t('annotation.toolbar.rectangle')}
              icon={<Square />}
            />
            <ToolButton tool="circle" label={t('annotation.toolbar.circle')} icon={<Circle />} />
            <ToolButton tool="text" label={t('annotation.toolbar.text')} icon={<Type />} />
            <ToolButton
              tool="pixelate"
              label={t('annotation.toolbar.pixelate')}
              icon={<HatGlasses />}
            />
          </div>

          <div class="w-px h-6 bg-border" />

          {/* Colors */}
          <div class="flex items-center gap-1">
            {COLORS.map(({ value: color, labelKey }) => (
              <Tooltip key={color} content={t(labelKey)} side="bottom">
                <button
                  class="group flex w-6 h-6 items-center justify-center border-none bg-transparent p-0 cursor-pointer"
                  onMouseDown={preventMouseFocus}
                  onClick={() => setActiveColor(color)}
                  aria-label={t(labelKey)}
                >
                  <span
                    class={cn(
                      'block rounded-full transition-all',
                      activeColor === color
                        ? 'w-5 h-5 ring-2 ring-foreground ring-offset-1 ring-offset-muted'
                        : 'w-6 h-6 group-hover:scale-110'
                    )}
                    style={{ backgroundColor: color }}
                  />
                </button>
              </Tooltip>
            ))}
          </div>

          <div class="w-px h-6 bg-border" />

          {/* Stroke Width */}
          <div class="flex items-center gap-1">
            {STROKE_WIDTHS.map((width) => (
              <Tooltip
                key={width}
                content={t('annotation.toolbar.strokeWidth', { width })}
                side="bottom"
              >
                <button
                  class={cn(
                    'flex items-center justify-center w-8 h-8 border-none rounded bg-transparent cursor-pointer transition-colors',
                    'hover:bg-foreground/10',
                    strokeWidth === width && 'bg-primary/10'
                  )}
                  onMouseDown={preventMouseFocus}
                  onClick={() => setStrokeWidth(width)}
                  aria-label={t('annotation.toolbar.strokeWidth', { width })}
                >
                  <span class="w-5 bg-foreground rounded-full" style={{ height: `${width}px` }} />
                </button>
              </Tooltip>
            ))}
          </div>

          <div class="w-px h-6 bg-border" />

          {/* Undo/Redo */}
          <div class="flex items-center gap-1">
            <Tooltip content={t('annotation.toolbar.undo')} side="bottom">
              <button
                class="flex items-center justify-center w-8 h-8 border-none rounded bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:w-4.5 [&_svg]:h-4.5"
                onMouseDown={preventMouseFocus}
                onClick={undo}
                disabled={!canUndo}
                aria-label={t('annotation.toolbar.undo')}
              >
                <Undo2 />
              </button>
            </Tooltip>
            <Tooltip content={t('annotation.toolbar.redo')} side="bottom">
              <button
                class="flex items-center justify-center w-8 h-8 border-none rounded bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:w-4.5 [&_svg]:h-4.5"
                onMouseDown={preventMouseFocus}
                onClick={redo}
                disabled={!canRedo}
                aria-label={t('annotation.toolbar.redo')}
              >
                <Redo2 />
              </button>
            </Tooltip>
            <Tooltip content={t('annotation.toolbar.delete')} side="bottom">
              <button
                class="flex items-center justify-center w-8 h-8 border-none rounded bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:w-4.5 [&_svg]:h-4.5"
                onMouseDown={preventMouseFocus}
                onClick={deleteSelected}
                aria-label={t('annotation.toolbar.delete')}
              >
                <Trash2 />
              </button>
            </Tooltip>
          </div>
        </div>

        <Tooltip
          content={t(isMaximized ? 'annotation.toolbar.restore' : 'annotation.toolbar.maximize')}
          side="bottom"
          align="end"
        >
          <button
            class="hidden sm:flex shrink-0 items-center justify-center w-8 h-8 border-none rounded bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-foreground/10 hover:text-foreground [&_svg]:w-4.5 [&_svg]:h-4.5"
            onMouseDown={preventMouseFocus}
            onClick={onToggleMaximize}
            aria-label={t(
              isMaximized ? 'annotation.toolbar.restore' : 'annotation.toolbar.maximize'
            )}
          >
            {isMaximized ? <Minimize2 /> : <Maximize2 />}
          </button>
        </Tooltip>
      </div>

      {/* Canvas */}
      <div
        class="relative flex-auto min-h-0 min-w-0 overflow-hidden bg-muted"
        ref={canvasWrapperRef}
      >
        <div class="absolute inset-0" ref={canvasHostRef}>
          <canvas ref={canvasRef} />
        </div>

        {/* Zoom Controls */}
        <div class="absolute bottom-3 right-3 flex items-center gap-0.5 p-1 rounded-lg border border-solid border-border bg-background text-foreground [box-shadow:0_4px_12px_rgb(0_0_0/0.15)]">
          <Tooltip content={t('annotation.toolbar.zoomOut')} side="top">
            <button
              class="flex items-center justify-center w-8 h-8 border-none rounded bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:w-4.5 [&_svg]:h-4.5"
              onMouseDown={preventMouseFocus}
              onClick={handleZoomOut}
              disabled={zoomState.zoom <= zoomState.limits.min * ZOOM_LIMIT_TOLERANCE}
              aria-label={t('annotation.toolbar.zoomOut')}
            >
              <ZoomOut />
            </button>
          </Tooltip>
          <Tooltip content={t('annotation.toolbar.zoomFit')} side="top">
            <button
              class="flex items-center justify-center min-w-12 h-8 px-1.5 border-none rounded bg-transparent text-xs font-medium tabular-nums text-muted-foreground cursor-pointer transition-colors hover:bg-foreground/10 hover:text-foreground"
              onMouseDown={preventMouseFocus}
              onClick={fitToView}
              aria-label={t('annotation.toolbar.zoomFit')}
            >
              {Math.round(zoomState.zoom * zoomState.sceneScale * 100)}%
            </button>
          </Tooltip>
          <Tooltip content={t('annotation.toolbar.zoomIn')} side="top" align="end">
            <button
              class="flex items-center justify-center w-8 h-8 border-none rounded bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:w-4.5 [&_svg]:h-4.5"
              onMouseDown={preventMouseFocus}
              onClick={handleZoomIn}
              disabled={zoomState.zoom >= zoomState.limits.max / ZOOM_LIMIT_TOLERANCE}
              aria-label={t('annotation.toolbar.zoomIn')}
            >
              <ZoomIn />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Actions */}
      <div
        class={cn(
          'shrink-0 flex gap-3 p-4 border-t border-solid border-border bg-muted',
          isMaximized && 'sm:justify-end'
        )}
      >
        <Button
          variant="outline"
          class={cn('flex-1', isMaximized && 'sm:flex-none sm:w-30')}
          onMouseDown={preventMouseFocus}
          onClick={onCancel}
        >
          {t('annotation.buttons.cancel')}
        </Button>
        <Button
          class={cn('flex-1', isMaximized && 'sm:flex-none sm:w-30')}
          onMouseDown={preventMouseFocus}
          onClick={handleSave}
        >
          {t('annotation.buttons.done')}
        </Button>
      </div>
    </div>
  );
};
