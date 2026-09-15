/**
 * Cubic spline path through a list of points.
 *
 * Uses the same control-point construction as the classic "spline" series
 * (smoothing 1.5, control points forced onto a straight line through the
 * point, and clamped so that the curve never overshoots its neighbours),
 * which is what gives the reference chart its characteristic plateaus.
 */

/**
 * @typedef {{ x: number, y: number } | null} SplinePoint
 */

/**
 * Build an SVG path ("M … C …") through the given points.
 * `null` entries break the curve into separate segments.
 *
 * @param {SplinePoint[]} points
 * @returns {string}
 */
export function splinePath(points) {
  const segments = [];
  let current = [];
  for (const p of points) {
    if (p) current.push(p);
    else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);

  return segments.map(segmentPath).join(' ');
}

/** @param {{x:number,y:number}[]} pts */
function segmentPath(pts) {
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const smoothing = 1.5;
  const denom = smoothing + 1;
  /** right control point of the previous point */
  let prevRight = null;
  let d = `M ${pts[0].x} ${pts[0].y}`;

  for (let i = 1; i < pts.length; i++) {
    const point = pts[i];
    const last = pts[i - 1];
    const next = pts[i + 1];
    const plotX = point.x, plotY = point.y;
    let leftContX, leftContY, rightContX, rightContY;

    if (last && next) {
      const lastX = last.x, lastY = last.y, nextX = next.x, nextY = next.y;
      let correction = 0;

      leftContX = (smoothing * plotX + lastX) / denom;
      leftContY = (smoothing * plotY + lastY) / denom;
      rightContX = (smoothing * plotX + nextX) / denom;
      rightContY = (smoothing * plotY + nextY) / denom;

      // have the two control points make a straight line through the main point
      if (rightContX !== leftContX) {
        correction = ((rightContY - leftContY) * (rightContX - plotX)) / (rightContX - leftContX) + plotY - rightContY;
      }
      leftContY += correction;
      rightContY += correction;

      // to prevent false extremes, check that control points are between neighbouring points' y values
      if (leftContY > lastY && leftContY > plotY) {
        leftContY = Math.max(lastY, plotY);
        rightContY = 2 * plotY - leftContY; // mirror of left control point
      } else if (leftContY < lastY && leftContY < plotY) {
        leftContY = Math.min(lastY, plotY);
        rightContY = 2 * plotY - leftContY;
      }
      if (rightContY > nextY && rightContY > plotY) {
        rightContY = Math.max(nextY, plotY);
        leftContY = 2 * plotY - rightContY;
      } else if (rightContY < nextY && rightContY < plotY) {
        rightContY = Math.min(nextY, plotY);
        leftContY = 2 * plotY - rightContY;
      }
    }

    const c1x = prevRight ? prevRight.x : last.x;
    const c1y = prevRight ? prevRight.y : last.y;
    const c2x = leftContX ?? plotX;
    const c2y = leftContY ?? plotY;
    d += ` C ${r(c1x)} ${r(c1y)} ${r(c2x)} ${r(c2y)} ${r(plotX)} ${r(plotY)}`;

    prevRight = rightContX !== undefined ? { x: rightContX, y: rightContY } : null;
  }
  return d;
}

const r = (n) => Math.round(n * 100) / 100;
