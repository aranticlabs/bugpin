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
  Maximize,
  ZoomIn,
} from 'lucide-preact';
import { cn } from '../lib/utils';
import { Button } from '../components/ui';
import { useLocale } from '../hooks/use-locale.js';
import { t } from '../i18n/index.js';

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
  onSave: (annotatedImage: string, annotations: object) => void;
  onCancel: () => void;
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#000000'];
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

  // Save and reset viewport for accurate coordinate mapping
  const currentZoom = canvas.getZoom();
  const currentViewport = canvas.viewportTransform?.slice() || [1, 0, 0, 1, 0, 0];
  canvas.setZoom(1);
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  canvas.renderAll();
  obj.setCoords();

  // Get current bounds in canvas space
  const bounds = obj.getBoundingRect();
  const left = bounds.left;
  const top = bounds.top;
  const width = bounds.width;
  const height = bounds.height;

  if (width < 5 || height < 5) {
    // Restore viewport
    canvas.setZoom(currentZoom);
    canvas.setViewportTransform(
      currentViewport as [number, number, number, number, number, number]
    );
    canvas.renderAll();
    return;
  }

  const bgElement = bgImage.getElement() as HTMLImageElement;
  const scaleX = bgImage.scaleX || 1;
  const scaleY = bgImage.scaleY || 1;

  // Use stored blockSize for consistency, or calculate if not available
  const storedBlockSize = objWithData.data?.blockSize;
  const blockSize = storedBlockSize || Math.max(3, Math.round(Math.min(width, height) / 20));

  // Create temp canvas to extract region
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
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
      width,
      height
    );

    // Apply pixelate filter directly to the temp canvas
    const tempFabricImg = new fabric.FabricImage(tempCanvas);
    tempFabricImg.filters = [new fabric.filters.Pixelate({ blocksize: blockSize })];
    tempFabricImg.applyFilters();

    // Get the filtered canvas element
    const filteredElement = tempFabricImg.getElement() as HTMLCanvasElement;

    // Check if this generation is still current (not stale)
    if (objWithData.data?.generationId !== generationId) {
      // Stale - a newer regeneration is in progress, abort
      canvas.setZoom(currentZoom);
      canvas.setViewportTransform(
        currentViewport as [number, number, number, number, number, number]
      );
      canvas.renderAll();
      return;
    }

    // Update the fabric image's element directly with canvas (no async image load needed)
    obj.setElement(filteredElement);

    // Reset scale since we regenerated at correct size
    obj.set({
      scaleX: 1,
      scaleY: 1,
      width: width,
      height: height,
    });

    // Update metadata (preserve blockSize)
    objWithData.data = { type: 'pixelate', blockSize, generationId };
  }

  // Restore viewport and render
  canvas.setZoom(currentZoom);
  canvas.setViewportTransform(currentViewport as [number, number, number, number, number, number]);
  canvas.renderAll();
}

export const AnnotationCanvas: FunctionComponent<AnnotationCanvasProps> = ({
  screenshot,
  onSave,
  onCancel,
}) => {
  useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const [activeTool, setActiveTool] = useState<AnnotationTool>('select');
  const [activeColor, setActiveColor] = useState('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const isDrawingRef = useRef(false);
  const isPanningRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const originalDimensionsRef = useRef<{ width: number; height: number } | null>(null);

  // Initialize Fabric.js canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      isDrawingMode: false,
      selection: true,
    });
    fabricRef.current = canvas;

    // Load screenshot as background
    fabric.FabricImage.fromURL(screenshot).then((img) => {
      // Store original dimensions for high-quality export
      originalDimensionsRef.current = {
        width: img.width || 800,
        height: img.height || 600,
      };

      // Scale image to fit container while maintaining aspect ratio
      // Get actual available space from the canvas wrapper element
      const wrapperRect = canvasWrapperRef.current?.getBoundingClientRect();
      const maxWidth = wrapperRect ? wrapperRect.width - 32 : 800; // 32px for padding
      const maxHeight = wrapperRect ? wrapperRect.height - 32 : 600;

      const scale = Math.min(maxWidth / (img.width || 800), maxHeight / (img.height || 600));

      canvas.setDimensions({
        width: (img.width || 800) * scale,
        height: (img.height || 600) * scale,
      });

      img.scaleToWidth(canvas.width!);
      canvas.backgroundImage = img;
      canvas.renderAll();

      // Save initial state
      saveToHistory();
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

        case 'text':
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

          // Save current zoom and viewport state
          const currentZoom = canvas.getZoom();
          const currentViewport = canvas.viewportTransform?.slice() || [1, 0, 0, 1, 0, 0];

          // Reset to identity transform for accurate coordinate mapping
          canvas.setZoom(1);
          canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
          canvas.renderAll();
          rect.setCoords();

          // Get rect bounds accounting for any object transforms
          const bounds = rect.getBoundingRect();
          const left = bounds.left;
          const top = bounds.top;
          const width = bounds.width;
          const height = bounds.height;

          // Only create pixelated region if it has meaningful size
          if (width > 5 && height > 5) {
            // Get the background image
            const bgImage = canvas.backgroundImage as fabric.FabricImage;
            const bgElement = bgImage.getElement() as HTMLImageElement;

            // Calculate scale factor between canvas and original image
            const scaleX = bgImage.scaleX || 1;
            const scaleY = bgImage.scaleY || 1;

            // Create temp canvas to extract region at canvas resolution
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
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
                width,
                height
              );

              // Apply pixelate filter - smaller blocks for finer pixelation
              const blockSize = Math.max(3, Math.round(Math.min(width, height) / 20));

              // Create Fabric image from extracted region with metadata
              const regionImage = new fabric.FabricImage(tempCanvas, {
                left,
                top,
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

          // Restore zoom and viewport
          canvas.setZoom(currentZoom);
          canvas.setViewportTransform(
            currentViewport as [number, number, number, number, number, number]
          );
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
    const multiplier = originalDimensions ? originalDimensions.width / (canvas.width || 1) : 1;

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
          const exportWidth = bounds.width * multiplier;
          const exportHeight = bounds.height * multiplier;

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
              scaleX: 1 / multiplier,
              scaleY: 1 / multiplier,
            });
          }
        }
      });
      canvas.renderAll();
    }

    // Get annotated image as data URL at original resolution
    const dataUrl = canvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: multiplier,
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

  const handleZoomIn = useCallback(() => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;
    const newZoom = Math.min(zoomLevel * 1.2, 3); // Max 3x zoom

    // Zoom to center of viewport
    const center = new fabric.Point(canvas.width! / 2, canvas.height! / 2);
    canvas.zoomToPoint(center, newZoom);
    setZoomLevel(newZoom);
  }, [zoomLevel]);

  const handleZoomOut = useCallback(() => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;
    const newZoom = Math.max(zoomLevel / 1.2, 0.5); // Min 0.5x zoom

    // Zoom to center of viewport
    const center = new fabric.Point(canvas.width! / 2, canvas.height! / 2);
    canvas.zoomToPoint(center, newZoom);
    setZoomLevel(newZoom);
  }, [zoomLevel]);

  const handleZoomReset = useCallback(() => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;
    setZoomLevel(1);
    canvas.setZoom(1);
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]); // Reset pan as well
    canvas.renderAll();
  }, []);

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
        const vpt = canvas.viewportTransform!;
        vpt[4] += evt.clientX - lastPosRef.current.x;
        vpt[5] += evt.clientY - lastPosRef.current.y;
        canvas.requestRenderAll();
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
  }, [isPanning, activeTool]);

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
      if (e.key === ' ' && !isPanning) {
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
    <button
      class={cn(
        'flex items-center justify-center w-8 h-8 border-none rounded bg-transparent text-muted-foreground cursor-pointer transition-colors',
        'hover:bg-foreground/10 hover:text-foreground',
        '[&_svg]:w-4.5 [&_svg]:h-4.5',
        activeTool === tool && 'bg-primary/10 text-primary'
      )}
      onClick={() => setActiveTool(tool)}
      title={label}
    >
      {icon}
    </button>
  );

  return (
    <div class="h-full min-h-0 flex flex-col">
      {/* Toolbar */}
      <div class="shrink-0 flex flex-wrap items-center gap-2 px-4 py-3 border-b border-solid border-border bg-muted">
        <div class="flex items-center gap-1">
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
          {COLORS.map((color) => (
            <button
              key={color}
              class="group flex w-6 h-6 items-center justify-center border-none bg-transparent p-0 cursor-pointer"
              onClick={() => setActiveColor(color)}
              title={color}
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
          ))}
        </div>

        <div class="w-px h-6 bg-border" />

        {/* Stroke Width */}
        <div class="flex items-center gap-1">
          {STROKE_WIDTHS.map((width) => (
            <button
              key={width}
              class={cn(
                'flex items-center justify-center w-8 h-8 border-none rounded bg-transparent cursor-pointer transition-colors',
                'hover:bg-foreground/10',
                strokeWidth === width && 'bg-primary/10'
              )}
              onClick={() => setStrokeWidth(width)}
              title={t('annotation.toolbar.strokeWidth', { width })}
            >
              <span class="w-5 bg-foreground rounded-full" style={{ height: `${width}px` }} />
            </button>
          ))}
        </div>

        <div class="w-px h-6 bg-border" />

        {/* Undo/Redo */}
        <div class="flex items-center gap-1">
          <button
            class="flex items-center justify-center w-8 h-8 border-none rounded bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:w-4.5 [&_svg]:h-4.5"
            onClick={undo}
            disabled={!canUndo}
            title={t('annotation.toolbar.undo')}
          >
            <Undo2 />
          </button>
          <button
            class="flex items-center justify-center w-8 h-8 border-none rounded bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:w-4.5 [&_svg]:h-4.5"
            onClick={redo}
            disabled={!canRedo}
            title={t('annotation.toolbar.redo')}
          >
            <Redo2 />
          </button>
          <button
            class="flex items-center justify-center w-8 h-8 border-none rounded bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:w-4.5 [&_svg]:h-4.5"
            onClick={deleteSelected}
            title={t('annotation.toolbar.delete')}
          >
            <Trash2 />
          </button>
        </div>

        <div class="w-px h-6 bg-border" />

        {/* Zoom Controls */}
        <div class="flex items-center gap-1">
          <button
            class="flex items-center justify-center w-8 h-8 border-none rounded bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:w-4.5 [&_svg]:h-4.5"
            onClick={handleZoomOut}
            disabled={zoomLevel <= 0.5}
            title={t('annotation.toolbar.zoomOut')}
          >
            <ZoomOut />
          </button>
          <button
            class="flex items-center justify-center w-8 h-8 border-none rounded bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:w-4.5 [&_svg]:h-4.5"
            onClick={handleZoomReset}
            title={t('annotation.toolbar.zoomReset', { percent: Math.round(zoomLevel * 100) })}
          >
            <Maximize />
          </button>
          <button
            class="flex items-center justify-center w-8 h-8 border-none rounded bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:w-4.5 [&_svg]:h-4.5"
            onClick={handleZoomIn}
            disabled={zoomLevel >= 3}
            title={t('annotation.toolbar.zoomIn')}
          >
            <ZoomIn />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        class="flex-auto min-h-0 min-w-[700px] overflow-auto flex items-center justify-center p-4 bg-muted"
        ref={canvasWrapperRef}
      >
        <canvas ref={canvasRef} />
      </div>

      {/* Actions */}
      <div class="shrink-0 flex gap-3 p-4 border-t border-solid border-border bg-muted">
        <Button variant="outline" class="flex-1" onClick={onCancel}>
          {t('annotation.buttons.cancel')}
        </Button>
        <Button class="flex-1" onClick={handleSave}>
          {t('annotation.buttons.done')}
        </Button>
      </div>
    </div>
  );
};
