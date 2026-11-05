import { describe, it, expect } from 'bun:test';
import { computeTooltipShift } from '@shared/tooltip-position';

describe('computeTooltipShift', () => {
  it('keeps a centered tooltip in place when it fits', () => {
    expect(computeTooltipShift(500, 100, 0, 1000)).toBe(0);
  });

  it('shifts left so the tooltip stays 4px inside the right edge', () => {
    // Centered left edge would be 960, right edge 1060; it must end at 996.
    expect(computeTooltipShift(1010, 100, 0, 1000)).toBe(-64);
  });

  it('shifts right so the tooltip stays 4px inside the left edge', () => {
    expect(computeTooltipShift(20, 100, 0, 1000)).toBe(34);
  });

  it('measures against bounds that do not start at 0', () => {
    expect(computeTooltipShift(310, 100, 100, 300)).toBe(-64);
  });
});
