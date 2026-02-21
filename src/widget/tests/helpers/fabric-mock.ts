import { mock } from 'bun:test';

class FabricObject {
  static ownDefaults: Record<string, unknown> = {
    originX: 'left',
    originY: 'top',
  };

  data?: Record<string, unknown>;
  left = 0;
  top = 0;
  width = 10;
  height = 10;
  scaleX = 1;
  scaleY = 1;
  angle = 0;
  skewX = 0;
  skewY = 0;
  flipX = false;
  flipY = false;
  stroke?: string;
  strokeWidth?: number;

  constructor(props: Record<string, unknown> = {}) {
    Object.assign(this, props);
  }

  set(values: Record<string, unknown>) {
    Object.assign(this, values);
    return this;
  }

  setCoords() {
    return undefined;
  }

  getBoundingRect() {
    return {
      left: this.left,
      top: this.top,
      width: this.width,
      height: this.height,
    };
  }

  toObject(propertiesToInclude?: string[]) {
    const result: Record<string, unknown> = {};
    if (propertiesToInclude?.includes('data')) {
      result.data = this.data;
    }
    return result;
  }
}

class FabricImage extends FabricObject {
  filters: unknown[] = [];
  constructor(element?: unknown, props?: Record<string, unknown>) {
    super(props);
    if (element) {
      this.width = this.width || 800;
      this.height = this.height || 600;
    }
  }

  static async fromURL() {
    return new FabricImage();
  }

  applyFilters() {
    return undefined;
  }

  getElement() {
    return globalThis.document?.createElement?.('img') ?? ({} as HTMLImageElement);
  }

  scaleToWidth(width: number) {
    const base = this.width || 1;
    this.scaleX = width / base;
  }
}

class PencilBrush {
  color = '';
  width = 1;
  constructor(_canvas: unknown) {}
}

class Canvas {
  width = 0;
  height = 0;
  isDrawingMode = false;
  selection = true;
  defaultCursor = 'default';
  freeDrawingBrush: PencilBrush | null = null;
  backgroundImage: FabricImage | null = null;
  viewportTransform: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  private zoom = 1;
  private objects: FabricObject[] = [];
  events = new Map<string, (event?: unknown) => void>();

  constructor(el: unknown, _options?: Record<string, unknown>) {
    (globalThis as Record<string, unknown>).__fabricCanvasReady = true;
    if (el && typeof el === 'object') {
      (el as Record<string, unknown>).__fabricCanvas = this;
    }
  }

  setDimensions({ width, height }: { width: number; height: number }) {
    this.width = width;
    this.height = height;
  }

  setZoom(zoom: number) {
    this.zoom = zoom;
  }

  getZoom() {
    return this.zoom;
  }

  setViewportTransform(transform: [number, number, number, number, number, number]) {
    this.viewportTransform = transform;
  }

  zoomToPoint(_point: unknown, zoom: number) {
    this.zoom = zoom;
  }

  renderAll() {
    return undefined;
  }

  requestRenderAll() {
    return undefined;
  }

  getScenePoint(event?: { clientX?: number; clientY?: number }) {
    return { x: event?.clientX ?? 0, y: event?.clientY ?? 0 };
  }

  add(obj: FabricObject) {
    this.objects.push(obj);
  }

  remove(obj: FabricObject) {
    this.objects = this.objects.filter((item) => item !== obj);
  }

  getObjects() {
    return this.objects;
  }

  getActiveObjects() {
    return [] as FabricObject[];
  }

  discardActiveObject() {
    return undefined;
  }

  on(event: string, handler: (event?: unknown) => void) {
    this.events.set(event, handler);
  }

  off(event: string) {
    this.events.delete(event);
  }

  trigger(event: string, payload?: unknown) {
    const handler = this.events.get(event);
    if (handler) {
      handler(payload);
    }
  }

  findTarget() {
    return null;
  }

  setActiveObject(_obj: FabricObject) {
    return undefined;
  }

  toJSON() {
    return {};
  }

  loadFromJSON() {
    return Promise.resolve();
  }

  setCursor(cursor: string) {
    this.defaultCursor = cursor;
  }

  toDataURL() {
    return 'data:image/png;base64,stub';
  }

  dispose() {
    return undefined;
  }
}

class Rect extends FabricObject {}
class Ellipse extends FabricObject {}
class Line extends FabricObject {
  x1: number;
  y1: number;
  x2: number;
  y2: number;

  constructor(points: number[], props?: Record<string, unknown>) {
    super(props);
    this.x1 = points[0];
    this.y1 = points[1];
    this.x2 = points[2];
    this.y2 = points[3];
  }
}
class IText extends FabricObject {
  isEditing = false;
  enterEditing() {
    this.isEditing = true;
    return undefined;
  }
}
class Group extends FabricObject {
  objects: FabricObject[];
  constructor(objects: FabricObject[] = [], props?: Record<string, unknown>) {
    super(props);
    this.objects = objects;
  }
}
class Polygon extends FabricObject {}
class Point {
  constructor(
    public x: number,
    public y: number,
  ) {}
}

export function installFabricMock(): void {
  mock.module('fabric', () => ({
    Canvas,
    FabricImage,
    FabricObject,
    PencilBrush,
    Rect,
    Ellipse,
    Line,
    IText,
    Group,
    Polygon,
    Point,
    filters: {
      Pixelate: class {
        blocksize: number;
        constructor({ blocksize }: { blocksize: number }) {
          this.blocksize = blocksize;
        }
      },
    },
  }));
}
