const TOOLTIP_EDGE_MARGIN = 4;

// Horizontal shift (px) that keeps a tooltip centered on its anchor inside
// [boundsLeft, boundsRight], leaving `margin` free on both sides.
export function computeTooltipShift(
  anchorCenter: number,
  tooltipWidth: number,
  boundsLeft: number,
  boundsRight: number,
  margin: number = TOOLTIP_EDGE_MARGIN
): number {
  const centeredLeft = anchorCenter - tooltipWidth / 2;
  if (centeredLeft < boundsLeft + margin) {
    return boundsLeft + margin - centeredLeft;
  }
  if (centeredLeft + tooltipWidth > boundsRight - margin) {
    return boundsRight - margin - (centeredLeft + tooltipWidth);
  }
  return 0;
}
