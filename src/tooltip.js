import { formatNumber } from './utils.js';

/**
 * Shared tooltip: one box listing every series at the hovered x.
 *
 * Positioning follows the classic Highcharts algorithm:
 *  - with several points the box is placed to the LEFT of the hovered x
 *    (16 px away) if it fits, otherwise to the right, otherwise centred on x;
 *  - vertically it is centred on the mouse and clamped inside the chart;
 *  - when nothing fits the box goes to the top-left corner.
 * Movement is eased (300 ms, ease-out-cubic); hiding waits `hideDelay` ms and fades out.
 */
export class Tooltip {
  /**
   * @param {import('./chart.js').TimeSeriesChart} chart
   * @param {object} options
   */
  constructor(chart, options) {
    this.chart = chart;
    this.options = options;
    this.isHidden = true;
    this.hideTimer = 0;
    this.el = document.createElement('div');
    this.el.className = 'tsc-tooltip';
    this.el.setAttribute('role', 'tooltip');
    chart.container.appendChild(this.el);
  }

  /**
   * Update content and position.
   * @param {{ category: string, index: number, points: TooltipPoint[], anchorX: number, anchorY: number, negative: boolean }} ctx
   */
  refresh(ctx) {
    clearTimeout(this.hideTimer);
    this.el.innerHTML = this.buildHtml(ctx);

    const wasHidden = this.isHidden;
    if (wasHidden) {
      this.isHidden = false;
      this.el.classList.remove('tsc-animate');
      this.el.classList.add('tsc-visible');
    }

    const boxWidth = this.el.offsetWidth;
    const boxHeight = this.el.offsetHeight;
    const pos = this.getPosition(boxWidth, boxHeight, ctx.anchorX, ctx.anchorY, ctx.points.length, ctx.negative);
    this.move(Math.round(pos.x), Math.round(pos.y), !wasHidden);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {boolean} animate
   */
  move(x, y, animate) {
    const el = this.el;
    if (animate && this.options.animation !== false) {
      el.classList.add('tsc-animate');
    } else {
      el.classList.remove('tsc-animate');
      // flush so that the next position change is animated from here
      void el.offsetWidth;
    }
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  /**
   * Hide after `delay` ms (default: options.hideDelay).
   * @param {number} [delay]
   */
  hide(delay) {
    clearTimeout(this.hideTimer);
    const d = delay ?? this.options.hideDelay ?? 500;
    this.hideTimer = setTimeout(() => {
      this.isHidden = true;
      this.el.classList.remove('tsc-visible', 'tsc-animate');
    }, d);
  }

  destroy() {
    clearTimeout(this.hideTimer);
    this.el.remove();
  }

  /**
   * @param {{ category: string, index: number, points: TooltipPoint[] }} ctx
   */
  buildHtml(ctx) {
    const o = this.options;
    if (typeof o.formatter === 'function') return o.formatter(ctx);

    const header = typeof o.headerFormatter === 'function'
      ? o.headerFormatter(ctx)
      : `<div class="tsc-tooltip-header">${escapeHtml(ctx.category)}</div>`;

    const rows = ctx.points.map((p) => {
      if (typeof o.pointFormatter === 'function') return o.pointFormatter(p, ctx);
      const value = escapeHtml(p.formatted);
      return `<div class="tsc-tooltip-point"><span class="tsc-tooltip-bullet" style="color:${escapeHtml(p.color)}">●</span> ${escapeHtml(p.name)}: <b>${value}</b></div>`;
    });
    return header + rows.join('');
  }

  /**
   * Port of the classic Highcharts `Tooltip.getPosition` (non-inverted chart).
   *
   * @param {number} boxWidth
   * @param {number} boxHeight
   * @param {number} anchorX  chart-relative x of the hovered points
   * @param {number} anchorY  chart-relative y (mouse y for shared tooltips)
   * @param {number} len      number of points in the tooltip
   * @param {boolean} negative
   * @returns {{ x: number, y: number }}
   */
  getPosition(boxWidth, boxHeight, anchorX, anchorY, len, negative) {
    const { chartWidth, chartHeight, plotLeft, plotTop, plotWidth, plotHeight } = this.chart;
    const distance = this.options.distance ?? 16;
    const ret = { x: 0, y: 0 };
    const preferFarSide = !!negative;
    let swapped = false;

    let first = ['y', chartHeight, boxHeight, anchorY, plotTop, plotTop + plotHeight];
    let second = ['x', chartWidth, boxWidth, anchorX, plotLeft, plotLeft + plotWidth];

    const firstDimension = (dim, outerSize, innerSize, point, min, max) => {
      const roomLeft = innerSize < point - distance;
      const roomRight = point + distance + innerSize < outerSize;
      const alignedLeft = point - distance - innerSize;
      const alignedRight = point + distance;
      if (preferFarSide && roomRight) ret[dim] = alignedRight;
      else if (!preferFarSide && roomLeft) ret[dim] = alignedLeft;
      else if (roomRight) ret[dim] = Math.min(max - innerSize, alignedRight);
      else if (roomLeft) ret[dim] = Math.max(min, alignedLeft);
      else return false;
      return true;
    };

    const secondDimension = (dim, outerSize, innerSize, point) => {
      // too close to the edge → swap dimensions
      if (point < distance || point > outerSize - distance) return false;
      if (point < innerSize / 2) ret[dim] = 1;
      else if (point > outerSize - innerSize / 2) ret[dim] = outerSize - innerSize - 2;
      else ret[dim] = point - innerSize / 2;
      return true;
    };

    const swap = () => {
      const temp = first;
      first = second;
      second = temp;
    };

    const run = () => {
      if (firstDimension(...first)) {
        if (!secondDimension(...second) && !swapped) {
          swapped = true;
          swap();
          run();
        }
      } else if (!swapped) {
        swapped = true;
        swap();
        run();
      } else {
        ret.x = 0;
        ret.y = 0;
      }
    };

    // several points → primary dimension is x (box goes left/right of the points)
    if (len > 1) swap();
    run();
    return ret;
  }
}

/**
 * @typedef {object} TooltipPoint
 * @property {object} series
 * @property {string} name
 * @property {string} color
 * @property {number} y
 * @property {string} formatted
 */

/** @param {unknown} s */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Default value formatting for a tooltip row.
 * @param {number} y
 * @param {{ valueDecimals?: number, valuePrefix?: string, valueSuffix?: string }} s
 * @param {{ decimalPoint?: string, thousandsSep?: string }} [lang]
 */
export function formatValue(y, s, lang = {}) {
  return (s.valuePrefix || '') + formatNumber(y, s.valueDecimals, lang.decimalPoint, lang.thousandsSep) + (s.valueSuffix || '');
}
