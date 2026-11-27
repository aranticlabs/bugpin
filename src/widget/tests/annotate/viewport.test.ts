import { describe, expect, it } from 'bun:test';
import {
  clampZoom,
  constrainViewport,
  FIT_PADDING,
  fitViewport,
  fitZoom,
  panBy,
  sceneScaleFor,
  wheelDeltaPx,
  wheelZoomFactor,
  zoomAtPoint,
  zoomLimits,
  type ViewportTransform,
} from '../../annotate/viewport';

const view = { width: 1032, height: 632 };
const scene = { width: 800, height: 600 };

describe('annotation viewport', () => {
  it('fits the scene inside the padded view and centers it', () => {
    const zoom = fitZoom(view, scene);
    expect(zoom).toBe((632 - FIT_PADDING * 2) / 600);

    const [a, , , d, e, f] = fitViewport(view, scene);
    expect(a).toBe(zoom);
    expect(d).toBe(zoom);
    expect(e).toBe((1032 - 800 * zoom) / 2);
    expect(f).toBe(FIT_PADDING);
  });

  it('keeps the fit zoom positive when the view has no room', () => {
    expect(fitZoom({ width: 0, height: -40 }, scene)).toBeGreaterThan(0);
  });

  it('floors the scene scale for a view that is not laid out yet', () => {
    expect(sceneScaleFor({ width: 832, height: 632 }, { width: 1600, height: 1200 })).toBe(0.5);
    expect(sceneScaleFor({ width: 0, height: 0 }, { width: 1920, height: 1080 })).toBe(0.05);
  });

  it('allows zooming out to half the fit and in to 3x the fit or 400% of the screenshot', () => {
    const fit = fitZoom(view, scene);
    expect(zoomLimits(view, scene, 1)).toEqual({ min: fit / 2, max: 4 });
    expect(zoomLimits(view, scene, 0.1)).toEqual({ min: fit / 2, max: 40 });
    expect(zoomLimits(view, scene, 100)).toEqual({ min: fit / 2, max: fit * 3 });
    expect(clampZoom(100, { min: 0.5, max: 3 })).toBe(3);
    expect(clampZoom(0.1, { min: 0.5, max: 3 })).toBe(0.5);
  });

  it('keeps the scene point under the cursor fixed while zooming', () => {
    const vpt: ViewportTransform = [1, 0, 0, 1, 16, 16];
    const point = { x: 216, y: 116 };
    const next = zoomAtPoint(vpt, point, 2);

    const sceneBefore = { x: (point.x - vpt[4]) / vpt[0], y: (point.y - vpt[5]) / vpt[3] };
    expect(next[0]).toBe(2);
    expect(next[4] + sceneBefore.x * next[0]).toBe(point.x);
    expect(next[5] + sceneBefore.y * next[3]).toBe(point.y);
  });

  it('centers an axis that fits and limits panning on an axis that overflows', () => {
    const zoomedIn: ViewportTransform = [2, 0, 0, 2, 0, 0];
    // 1600 x 1200 scene in a 1032 x 632 view: both axes overflow.
    expect(constrainViewport(panBy(zoomedIn, 500, 500), view, scene)).toEqual([
      2,
      0,
      0,
      2,
      FIT_PADDING,
      FIT_PADDING,
    ]);
    expect(constrainViewport(panBy(zoomedIn, -5000, -5000), view, scene)).toEqual([
      2,
      0,
      0,
      2,
      1032 - FIT_PADDING - 1600,
      632 - FIT_PADDING - 1200,
    ]);

    const zoomedOut: ViewportTransform = [0.5, 0, 0, 0.5, 300, -40];
    expect(constrainViewport(zoomedOut, view, scene)).toEqual([
      0.5,
      0,
      0,
      0.5,
      (1032 - 400) / 2,
      (632 - 300) / 2,
    ]);
  });

  it('converts line-based wheel deltas and maps wheel direction to zoom direction', () => {
    expect(wheelDeltaPx(-1, 2, 600)).toBe(-600);
    expect(wheelDeltaPx(3, 1, 600)).toBe(48);
    expect(wheelDeltaPx(120, 0, 600)).toBe(120);
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(-100) * wheelZoomFactor(100)).toBeCloseTo(1);
    // Small pinch deltas follow the fingers; a mouse notch is capped.
    expect(wheelZoomFactor(-10)).toBeCloseTo(Math.exp(0.1));
    expect(wheelZoomFactor(-100)).toBe(1.25);
    expect(wheelZoomFactor(wheelDeltaPx(3, 1, 600))).toBe(0.8);
  });
});
