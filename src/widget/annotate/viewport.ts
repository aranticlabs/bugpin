export type ViewportTransform = [number, number, number, number, number, number];

export interface Size {
  width: number;
  height: number;
}

export interface ViewportPoint {
  x: number;
  y: number;
}

export interface ZoomLimits {
  min: number;
  max: number;
}

/** Gap kept between the fitted scene and the edges of the view. */
export const FIT_PADDING = 16;

const ZOOM_OUT_FACTOR = 0.5;
const ZOOM_IN_FACTOR = 3;
/** Highest zoom, relative to the screenshot's own pixels, that is always reachable. */
const MAX_PIXEL_ZOOM = 4;
const MIN_SCENE_SCALE = 0.05;
// Browsers report a trackpad pinch as ctrl + wheel with deltaY of about -100 * ln(scale);
// a mouse notch is a single large delta, so each event is capped.
const WHEEL_ZOOM_DIVISOR = 100;
const MAX_WHEEL_ZOOM_STEP = 1.25;
const LINE_HEIGHT_PX = 16;

export function fitZoom(view: Size, scene: Size, padding = FIT_PADDING): number {
  const availableWidth = Math.max(view.width - padding * 2, 1);
  const availableHeight = Math.max(view.height - padding * 2, 1);
  return Math.min(availableWidth / scene.width, availableHeight / scene.height);
}

/**
 * Scale from screenshot pixels to scene units, fixed when the screenshot loads. Stroke
 * widths and text sizes are in scene units, so this keeps annotations the same size
 * relative to the view they were first drawn in. The floor guards against a view that
 * has not been laid out yet.
 */
export function sceneScaleFor(view: Size, image: Size): number {
  return Math.max(fitZoom(view, image), MIN_SCENE_SCALE);
}

export function fitViewport(view: Size, scene: Size, padding = FIT_PADDING): ViewportTransform {
  const zoom = fitZoom(view, scene, padding);
  return [
    zoom,
    0,
    0,
    zoom,
    (view.width - scene.width * zoom) / 2,
    (view.height - scene.height * zoom) / 2,
  ];
}

/**
 * Zoom range for a scene. `sceneScale` is the ratio of scene units to screenshot pixels,
 * so `MAX_PIXEL_ZOOM / sceneScale` is the zoom at which one screenshot pixel spans four
 * view pixels.
 */
export function zoomLimits(view: Size, scene: Size, sceneScale: number): ZoomLimits {
  const fit = fitZoom(view, scene);
  return {
    min: fit * ZOOM_OUT_FACTOR,
    max: Math.max(fit * ZOOM_IN_FACTOR, MAX_PIXEL_ZOOM / sceneScale),
  };
}

export function clampZoom(zoom: number, limits: ZoomLimits): number {
  return Math.min(Math.max(zoom, limits.min), limits.max);
}

/** Zooms so that the scene point under `point` stays under it. */
export function zoomAtPoint(
  vpt: ViewportTransform,
  point: ViewportPoint,
  zoom: number
): ViewportTransform {
  const sceneX = (point.x - vpt[4]) / vpt[0];
  const sceneY = (point.y - vpt[5]) / vpt[3];
  return [zoom, 0, 0, zoom, point.x - sceneX * zoom, point.y - sceneY * zoom];
}

export function panBy(vpt: ViewportTransform, dx: number, dy: number): ViewportTransform {
  return [vpt[0], vpt[1], vpt[2], vpt[3], vpt[4] + dx, vpt[5] + dy];
}

function constrainAxis(offset: number, sceneLength: number, viewLength: number, padding: number) {
  if (sceneLength <= viewLength - padding * 2) return (viewLength - sceneLength) / 2;
  return Math.min(padding, Math.max(viewLength - padding - sceneLength, offset));
}

/**
 * Keeps the scene reachable: an axis that fits in the view is centered, and an axis
 * larger than the view cannot be panned further than `padding` past its edges.
 */
export function constrainViewport(
  vpt: ViewportTransform,
  view: Size,
  scene: Size,
  padding = FIT_PADDING
): ViewportTransform {
  return [
    vpt[0],
    vpt[1],
    vpt[2],
    vpt[3],
    constrainAxis(vpt[4], scene.width * vpt[0], view.width, padding),
    constrainAxis(vpt[5], scene.height * vpt[3], view.height, padding),
  ];
}

/** Converts a wheel delta to pixels; Firefox reports mouse wheels in lines. */
export function wheelDeltaPx(delta: number, deltaMode: number): number {
  return deltaMode === 1 ? delta * LINE_HEIGHT_PX : delta;
}

/** Zoom multiplier for a ctrl/meta wheel event, including trackpad pinches. */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const factor = Math.exp(-wheelDeltaPx(deltaY, deltaMode) / WHEEL_ZOOM_DIVISOR);
  return Math.min(Math.max(factor, 1 / MAX_WHEEL_ZOOM_STEP), MAX_WHEEL_ZOOM_STEP);
}
