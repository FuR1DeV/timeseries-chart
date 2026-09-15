import { computeAxis } from './scale.js';
import { splinePath } from './spline.js';
import { Tooltip, formatValue } from './tooltip.js';
import { injectStyles } from './styles.js';
import { animate, easeInOutSine, brighten, formatDate, isNumber, merge, uniqueId, clamp } from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Default palette — the colours of the reference chart (area, bar, spline, line). */
export const DEFAULT_COLORS = ['#fef691', '#3870fe', '#0f8401', '#b500fe'];

/** Per-type defaults. */
export const TYPE_DEFAULTS = {
  area: { lineWidth: 1, fillOpacity: 0.5, marker: { enabled: undefined, symbol: 'circle', radius: 3 } },
  spline: { lineWidth: 3, marker: { enabled: undefined, symbol: 'circle', radius: 3 } },
  line: { lineWidth: 1, marker: { enabled: true, symbol: 'square', radius: 3 } },
  bar: { borderWidth: 1, borderColor: '#ffffff', borderRadius: 3, pointPadding: 0.2, groupPadding: 0.2 },
};

export const DEFAULT_OPTIONS = {
  width: undefined,
  height: undefined,
  spacing: 0,
  backgroundColor: 'transparent',
  plotBorderWidth: 1,
  plotBorderColor: '#cccccc',
  plotBackgroundColor: 'transparent',
  animation: { duration: 1000 },
  colors: DEFAULT_COLORS,
  categories: undefined,
  xFormat: 'dd.mm.yyyy',
  useUTC: false,
  yAxis: {
    alignTicks: true,
    tickPixelInterval: 72,
    minPadding: 0.05,
    maxPadding: 0.05,
  },
  tooltip: {
    enabled: true,
    distance: 16,
    hideDelay: 500,
    animation: true,
    formatter: undefined,
    headerFormatter: undefined,
    pointFormatter: undefined,
    decimalPoint: '.',
    thousandsSep: ' ',
  },
  states: {
    hover: {
      lineWidth: 1,
      halo: { size: 10, opacity: 0.25 },
      marker: { radiusPlus: 1, lineWidthPlus: 1, lineColor: '#ffffff' },
      brightness: 0.1,
    },
    inactive: { opacity: 0.2 },
  },
  series: [],
};

/**
 * @typedef {'area'|'spline'|'line'|'bar'} SeriesType
 */

/**
 * Chart rendering up to N time-series (typically 4: area, spline, line, bar) with a shared tooltip.
 *
 * ```js
 * const chart = new TimeSeriesChart(document.getElementById('chart'), {
 *   series: [
 *     { type: 'area',   name: 'Cost',          data: [[Date.UTC(2026, 5, 10), 2.04], ...] },
 *     { type: 'bar',    name: 'CPA',           data: [...] },
 *     { type: 'spline', name: 'ROI confirmed', data: [...] },
 *     { type: 'line',   name: 'Conversions',   data: [...] },
 *   ],
 * });
 * ```
 */
export class TimeSeriesChart {
  /**
   * @param {HTMLElement|string} container element or its id / CSS selector
   * @param {object} options
   */
  constructor(container, options = {}) {
    const el = typeof container === 'string'
      ? document.getElementById(container) || document.querySelector(container)
      : container;
    if (!el) throw new Error('TimeSeriesChart: container not found');
    injectStyles();

    this.container = el;
    this.userOptions = options;
    this.options = merge(DEFAULT_OPTIONS, options);
    this.id = uniqueId('tsc');
    this.hoverIndex = -1;
    this.hoverSeries = null;
    this.hasRendered = false;
    this.animations = [];
    this.destroyed = false;

    el.classList.add('tsc-container');
    // inner box = the chart's content area; the SVG and the tooltip live here,
    // so padding / borders on the user's container do not shift anything
    this.inner = document.createElement('div');
    this.inner.className = 'tsc-inner';
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'tsc-svg');
    // start at 0x0 so that an unsized container is measured as empty (→ default 600x400),
    // not as the browser's default 300x150 SVG box
    this.svg.setAttribute('width', '0');
    this.svg.setAttribute('height', '0');
    this.inner.appendChild(this.svg);
    el.appendChild(this.inner);

    this.tooltip = this.options.tooltip.enabled ? new Tooltip(this, this.options.tooltip) : null;

    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    el.addEventListener('mousemove', this.onPointerMove);
    el.addEventListener('touchstart', this.onPointerMove, { passive: true });
    el.addEventListener('touchmove', this.onPointerMove, { passive: true });
    el.addEventListener('mouseleave', this.onPointerLeave);
    el.addEventListener('touchend', this.onPointerLeave);

    if (typeof ResizeObserver !== 'undefined' && !(options.width && options.height)) {
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.hasRendered) return;
        const { width, height } = this.measure();
        if (width !== this.chartWidth || height !== this.chartHeight) this.render(false);
      });
      this.resizeObserver.observe(el);
    }

    this.render(true);
  }

  // ---------------------------------------------------------------- public API

  /**
   * Merge new options into the chart and redraw.
   * @param {object} options
   * @param {boolean} [animate=false] run the initial animation again
   */
  update(options, animate = false) {
    this.userOptions = merge(this.userOptions, options);
    if (options.series) this.userOptions.series = options.series; // arrays are replaced, not merged
    this.options = merge(DEFAULT_OPTIONS, this.userOptions);
    const wantTooltip = this.options.tooltip.enabled !== false;
    if (wantTooltip && !this.tooltip) this.tooltip = new Tooltip(this, this.options.tooltip);
    else if (!wantTooltip && this.tooltip) { this.tooltip.destroy(); this.tooltip = null; }
    else if (this.tooltip) this.tooltip.options = this.options.tooltip;
    this.render(animate);
  }

  /**
   * Replace the data of every series (same order as `options.series`).
   * @param {Array<Array<number|null|[any, number|null]|{x:any,y:number|null}>>} data
   * @param {boolean} [animate=false]
   */
  setData(data, animate = false) {
    const series = (this.userOptions.series || []).map((s, i) => (data[i] ? { ...s, data: data[i] } : s));
    this.update({ series }, animate);
  }

  /** @param {number} width @param {number} height */
  setSize(width, height) {
    this.userOptions = { ...this.userOptions, width, height };
    this.options = merge(DEFAULT_OPTIONS, this.userOptions);
    this.render(false);
  }

  /** Re-measure the container and redraw (also done automatically through ResizeObserver). */
  reflow() {
    this.render(false);
  }

  destroy() {
    this.destroyed = true;
    this.cancelAnimations();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    const el = this.container;
    el.removeEventListener('mousemove', this.onPointerMove);
    el.removeEventListener('touchstart', this.onPointerMove);
    el.removeEventListener('touchmove', this.onPointerMove);
    el.removeEventListener('mouseleave', this.onPointerLeave);
    el.removeEventListener('touchend', this.onPointerLeave);
    if (this.tooltip) this.tooltip.destroy();
    this.inner.remove();
    el.classList.remove('tsc-container');
  }

  // ---------------------------------------------------------------- layout

  /** Size of the container's content box (padding and border excluded); 600x400 when it has no size. */
  measure() {
    const o = this.options;
    const el = this.container;
    const cs = getComputedStyle(el);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const width = Math.max(1, Math.round(o.width || el.clientWidth - padX || 600));
    const height = Math.max(1, Math.round(o.height || el.clientHeight - padY || 400));
    return { width, height };
  }

  layout() {
    const o = this.options;
    const { width, height } = this.measure();
    const sp = Array.isArray(o.spacing) ? o.spacing : [o.spacing, o.spacing, o.spacing, o.spacing];
    this.chartWidth = width;
    this.chartHeight = height;
    this.plotLeft = sp[3];
    this.plotTop = sp[0];
    this.plotWidth = Math.max(1, width - sp[1] - sp[3]);
    this.plotHeight = Math.max(1, height - sp[0] - sp[2]);
  }

  /**
   * Normalise `options.series` / `options.categories` into aligned value arrays.
   */
  prepareData() {
    const o = this.options;
    const rawSeries = o.series || [];
    const fmtX = typeof o.xFormat === 'function' ? o.xFormat : (x) => formatX(x, o.xFormat, o.useUTC);

    /** @type {string[]} */
    let categories;
    /** @type {Array<Array<number|null>>} */
    let values;

    if (o.categories) {
      categories = o.categories.map((c) => fmtX(c));
      values = rawSeries.map((s) => categories.map((_, i) => toY(pointY(s.data && s.data[i]))));
    } else {
      // collect the union of x values (keeps insertion order for strings, sorts numbers/dates)
      const keys = new Map();
      let numeric = true;
      for (const s of rawSeries) {
        (s.data || []).forEach((item, i) => {
          const x = pointX(item, i);
          const key = xKey(x);
          if (typeof key !== 'number') numeric = false;
          if (!keys.has(key)) keys.set(key, x);
        });
      }
      let ordered = [...keys.keys()];
      if (numeric) ordered.sort((a, b) => a - b);
      const indexOf = new Map(ordered.map((k, i) => [k, i]));
      categories = ordered.map((k) => fmtX(keys.get(k)));
      values = rawSeries.map((s) => {
        const arr = new Array(ordered.length).fill(null);
        (s.data || []).forEach((item, i) => {
          const x = pointX(item, i);
          const key = xKey(x);
          arr[indexOf.get(key)] = toY(pointY(item));
        });
        return arr;
      });
    }

    this.categories = categories;
    this.series = rawSeries.map((s, index) => {
      const type = TYPE_DEFAULTS[s.type] ? s.type : 'line';
      const conf = merge(TYPE_DEFAULTS[type], s);
      return {
        index,
        type,
        name: s.name ?? `Series ${index + 1}`,
        color: s.color || o.colors[index % o.colors.length],
        yAxisKey: s.yAxis ?? index,
        values: values[index],
        conf,
        el: {},
        state: '',
      };
    });
  }

  /** One hidden y-axis per `yAxis` key; each is scaled to its own data. */
  prepareAxes() {
    const o = this.options.yAxis;
    const groups = new Map();
    for (const s of this.series) {
      if (!groups.has(s.yAxisKey)) groups.set(s.yAxisKey, []);
      groups.get(s.yAxisKey).push(s);
    }
    const alignTicks = o.alignTicks !== false && groups.size > 1;
    this.axes = new Map();
    for (const [key, list] of groups) {
      let dataMin = Infinity;
      let dataMax = -Infinity;
      for (const s of list) {
        for (const v of s.values) {
          if (v === null) continue;
          if (v < dataMin) dataMin = v;
          if (v > dataMax) dataMax = v;
        }
      }
      const userAxis = (this.options.yAxes && this.options.yAxes[key]) || {};
      const axis = computeAxis(dataMin, dataMax, {
        plotHeight: this.plotHeight,
        tickPixelInterval: o.tickPixelInterval,
        minPadding: userAxis.minPadding ?? o.minPadding,
        maxPadding: userAxis.maxPadding ?? o.maxPadding,
        alignTicks,
        tickAmount: userAxis.tickAmount ?? o.tickAmount,
        min: userAxis.min,
        max: userAxis.max,
      });
      axis.toPixels = (v) => this.plotTop + this.plotHeight - ((v - axis.min) / (axis.max - axis.min || 1)) * this.plotHeight;
      this.axes.set(key, axis);
    }
    for (const s of this.series) s.axis = this.axes.get(s.yAxisKey);
  }

  /** x pixel position of every category. */
  prepareX() {
    const n = this.categories.length;
    const hasBars = this.series.some((s) => s.type === 'bar');
    this.slotWidth = n ? this.plotWidth / n : this.plotWidth;
    this.xPositions = [];
    for (let i = 0; i < n; i++) {
      this.xPositions.push(hasBars || n === 1
        ? this.plotLeft + (i + 0.5) * this.slotWidth
        : this.plotLeft + (i * this.plotWidth) / (n - 1));
    }
  }

  // ---------------------------------------------------------------- rendering

  /**
   * (Re)build the whole SVG.
   * @param {boolean} withAnimation
   */
  render(withAnimation) {
    if (this.destroyed) return;
    this.cancelAnimations();
    this.resetHover(true);
    this.layout();
    this.prepareData();
    this.prepareAxes();
    this.prepareX();

    const svg = this.svg;
    const o = this.options;
    svg.innerHTML = '';
    svg.setAttribute('width', String(this.chartWidth));
    svg.setAttribute('height', String(this.chartHeight));
    svg.setAttribute('viewBox', `0 0 ${this.chartWidth} ${this.chartHeight}`);

    // defs: clip rect for the initial animation / plot clipping
    const defs = svgEl('defs');
    const clipId = `${this.id}-clip`;
    const clip = svgEl('clipPath', { id: clipId });
    this.clipRect = svgEl('rect', { x: this.plotLeft, y: this.plotTop, width: this.plotWidth, height: this.plotHeight });
    clip.appendChild(this.clipRect);
    defs.appendChild(clip);
    svg.appendChild(defs);

    // background & plot area
    svg.appendChild(svgEl('rect', {
      class: 'tsc-background', x: 0, y: 0, width: this.chartWidth, height: this.chartHeight, fill: o.backgroundColor,
    }));
    svg.appendChild(svgEl('rect', {
      class: 'tsc-plot-background', x: this.plotLeft, y: this.plotTop, width: this.plotWidth, height: this.plotHeight, fill: o.plotBackgroundColor,
    }));
    if (o.plotBorderWidth > 0) {
      const bw = o.plotBorderWidth;
      svg.appendChild(svgEl('rect', {
        class: 'tsc-plot-border',
        x: this.plotLeft + bw / 2,
        y: this.plotTop + bw / 2,
        width: this.plotWidth - bw,
        height: this.plotHeight - bw,
        fill: 'none',
        stroke: o.plotBorderColor,
        'stroke-width': bw,
        rx: o.plotBorderRadius || 0,
      }));
    }

    // series
    this.seriesGroup = svgEl('g', { class: 'tsc-series-group' });
    svg.appendChild(this.seriesGroup);
    const barSeries = this.series.filter((s) => s.type === 'bar');
    for (const s of this.series) {
      if (s.type === 'bar') this.renderBarSeries(s, barSeries.indexOf(s), barSeries.length, clipId);
      else this.renderLineSeries(s, clipId);
    }

    this.hasRendered = true;
    if (withAnimation && o.animation !== false) this.runInitialAnimation();
  }

  /**
   * @param {object} s
   * @param {string} clipId
   */
  renderLineSeries(s, clipId) {
    const { conf, color } = s;
    const group = svgEl('g', { class: `tsc-series tsc-series-${s.type}`, 'data-series': s.index });
    const graphGroup = svgEl('g', { class: 'tsc-graph-group', 'clip-path': `url(#${clipId})` });
    group.appendChild(graphGroup);

    const pts = s.values.map((v, i) => (v === null ? null : { x: this.xPositions[i], y: s.axis.toPixels(v) }));
    s.points = pts;
    const linePath = s.type === 'spline' ? splinePath(pts) : polylinePath(pts);

    if (s.type === 'area') {
      const zero = clamp(s.axis.toPixels(0), this.plotTop, this.plotTop + this.plotHeight);
      const area = svgEl('path', {
        class: 'tsc-area',
        d: areaPath(pts, zero, s.type),
        fill: conf.fillColor || color,
        'fill-opacity': conf.fillOpacity,
        stroke: 'none',
      });
      graphGroup.appendChild(area);
      s.el.area = area;
    }

    const graph = svgEl('path', {
      class: 'tsc-graph',
      d: linePath,
      stroke: color,
      'stroke-dasharray': conf.dashStyle || null,
    });
    graph.style.strokeWidth = `${conf.lineWidth}px`;
    graphGroup.appendChild(graph);
    s.el.graph = graph;

    // markers (+ halo placeholder below them)
    const markerGroup = svgEl('g', { class: 'tsc-markers' });
    group.appendChild(markerGroup);
    s.el.markerGroup = markerGroup;
    // markers: explicit option, otherwise only when the series is a single point (nothing else to see)
    s.showMarkers = conf.marker.enabled ?? pts.filter(Boolean).length <= 1;
    s.el.markers = pts.map((p) => {
      if (!p) return null;
      const m = conf.marker;
      const el = svgEl(m.symbol === 'square' ? 'rect' : 'circle', { class: 'tsc-marker', fill: m.fillColor || color });
      if (!s.showMarkers) el.style.display = 'none';
      markerGroup.appendChild(el);
      this.applyMarkerState(s, el, p, false);
      return el;
    });

    this.seriesGroup.appendChild(group);
    s.el.group = group;
  }

  /**
   * @param {object} s
   * @param {number} barIndex   index among bar series
   * @param {number} barCount   number of bar series
   * @param {string} clipId
   */
  renderBarSeries(s, barIndex, barCount, clipId) {
    const { conf, color } = s;
    const group = svgEl('g', { class: 'tsc-series tsc-series-bar', 'data-series': s.index });
    const barGroup = svgEl('g', { class: 'tsc-graph-group tsc-bar-group', 'clip-path': `url(#${clipId})` });
    group.appendChild(barGroup);

    const bw = conf.borderWidth;
    const crisp = bw % 2 ? 0.5 : 0;
    const groupWidth = this.slotWidth * (1 - 2 * conf.groupPadding);
    const cellWidth = groupWidth / barCount;
    const pointWidth = conf.pointWidth ?? cellWidth * (1 - 2 * conf.pointPadding);
    const zero = clamp(s.axis.toPixels(0), this.plotTop, this.plotTop + this.plotHeight);
    s.baseline = zero;

    s.points = s.values.map((v, i) => (v === null ? null : { x: this.xPositions[i], y: s.axis.toPixels(v) }));
    s.el.bars = s.values.map((v, i) => {
      if (v === null) return null;
      const centre = this.xPositions[i] - groupWidth / 2 + cellWidth * (barIndex + 0.5);
      let x = centre - pointWidth / 2;
      let right = Math.round(x + pointWidth) + crisp;
      x = Math.round(x) + crisp;
      const w = Math.max(right - x, 1);
      const yVal = s.axis.toPixels(v);
      let top = Math.min(yVal, zero);
      let bottom = Math.max(yVal, zero);
      bottom = Math.round(bottom) + crisp;
      top = Math.round(top) + crisp;
      const h = Math.max(bottom - top, conf.minPointLength || 0);
      if (h > bottom - top) top = v >= 0 ? bottom - h : top;
      const el = svgEl('path', {
        class: 'tsc-bar',
        d: barPath(x, top, w, h, v >= 0 ? conf.borderRadius : 0, v < 0 ? conf.borderRadius : 0),
        fill: color,
        stroke: bw ? conf.borderColor : 'none',
        'stroke-width': bw,
      });
      barGroup.appendChild(el);
      return el;
    });

    this.seriesGroup.appendChild(group);
    s.el.group = group;
    s.el.barGroup = barGroup;
  }

  /** Initial reveal: lines/areas are clipped from the left, bars grow from the baseline. */
  runInitialAnimation() {
    const duration = this.options.animation?.duration ?? 1000;
    const plotWidth = this.plotWidth;
    this.clipRect.setAttribute('width', '0');
    const bars = this.series.filter((s) => s.type === 'bar');
    const lines = this.series.filter((s) => s.type !== 'bar');
    for (const s of bars) s.el.barGroup.setAttribute('transform', `translate(0 ${s.baseline}) scale(1 0.001) translate(0 ${-s.baseline})`);
    // markers are clipped together with the lines while they draw in
    for (const s of lines) s.el.markerGroup.setAttribute('clip-path', `url(#${this.id}-clip)`);

    this.animations.push(animate(duration, easeInOutSine, (pos) => {
      this.clipRect.setAttribute('width', String(plotWidth * pos));
      for (const s of bars) {
        s.el.barGroup.setAttribute('transform', pos >= 1 ? '' : `translate(0 ${s.baseline}) scale(1 ${Math.max(pos, 0.001)}) translate(0 ${-s.baseline})`);
      }
    }, () => {
      for (const s of lines) s.el.markerGroup.removeAttribute('clip-path');
    }));
  }

  cancelAnimations() {
    for (const a of this.animations) a.cancel();
    this.animations = [];
  }

  // ---------------------------------------------------------------- states

  /**
   * @param {object} s
   * @param {SVGElement} el
   * @param {{x:number,y:number}} p
   * @param {boolean} hover
   */
  applyMarkerState(s, el, p, hover) {
    const m = s.conf.marker;
    const hoverOpts = this.options.states.hover.marker;
    const radius = hover ? m.radius + (hoverOpts.radiusPlus || 0) : m.radius;
    const lineWidth = hover ? (m.lineWidth || 0) + (hoverOpts.lineWidthPlus || 0) : m.lineWidth || 0;
    if (el.tagName === 'rect') {
      setAttrs(el, { x: p.x - radius, y: p.y - radius, width: radius * 2, height: radius * 2 });
    } else {
      setAttrs(el, { cx: p.x, cy: p.y, r: radius });
    }
    setAttrs(el, {
      stroke: lineWidth ? (hover ? hoverOpts.lineColor : m.lineColor || '#ffffff') : 'none',
      'stroke-width': lineWidth,
    });
  }

  /**
   * Point hover state for every series at category `index` (markers, halos, bar brightness).
   * @param {number} index  -1 → clear
   */
  setPointState(index) {
    const prev = this.hoverIndex;
    if (prev === index) return;
    this.hoverIndex = index;
    const halo = this.options.states.hover.halo;

    for (const s of this.series || []) {
      if (s.type === 'bar') {
        if (prev >= 0 && s.el.bars[prev]) s.el.bars[prev].setAttribute('fill', s.color);
        if (index >= 0 && s.el.bars[index]) s.el.bars[index].setAttribute('fill', brighten(s.color, this.options.states.hover.brightness));
        continue;
      }
      // previous marker back to normal
      if (prev >= 0 && s.el.markers[prev]) {
        const el = s.el.markers[prev];
        this.applyMarkerState(s, el, s.points[prev], false);
        if (!s.showMarkers) el.style.display = 'none';
      }
      const p = index >= 0 ? s.points[index] : null;
      if (p) {
        const el = s.el.markers[index];
        el.style.display = '';
        this.applyMarkerState(s, el, p, true);
        // halo: appears instantly on the new point
        if (halo && halo.size) {
          if (s.haloAnim) { s.haloAnim.cancel(); s.haloAnim = null; }
          if (!s.el.halo) {
            s.el.halo = svgEl('circle', { class: 'tsc-halo', fill: s.color, 'fill-opacity': halo.opacity });
            s.el.markerGroup.insertBefore(s.el.halo, s.el.markerGroup.firstChild);
          }
          setAttrs(s.el.halo, { cx: p.x, cy: p.y, r: halo.size });
          s.el.halo.style.display = '';
        }
      } else if (s.el.halo && s.el.halo.style.display !== 'none') {
        // shrink the halo away
        const h = s.el.halo;
        const from = +h.getAttribute('r') || 0;
        if (s.haloAnim) s.haloAnim.cancel();
        s.haloAnim = animate(500, easeInOutSine, (pos) => h.setAttribute('r', String(from * (1 - pos))), () => {
          h.style.display = 'none';
        });
      }
      // series without a point at this x are "inactive"
      const inactive = index >= 0 && !p;
      s.el.group.classList.toggle('tsc-inactive', inactive);
      s.el.group.style.opacity = inactive ? String(this.options.states.inactive?.opacity ?? 0.2) : '';
    }
  }

  /**
   * Series hover state (line width) for the series closest to the pointer.
   * @param {object|null} series
   */
  setHoverSeries(series) {
    const prev = this.hoverSeries;
    if (prev === series) return;
    this.hoverSeries = series;
    const hoverWidth = this.options.states.hover.lineWidth;
    if (prev && prev.el.graph) {
      prev.el.group.classList.remove('tsc-hover');
      prev.el.graph.style.strokeWidth = `${prev.conf.lineWidth}px`;
    }
    if (series && series.el.graph) {
      series.el.group.classList.add('tsc-hover');
      const w = series.conf.states?.hover?.lineWidth ?? hoverWidth;
      series.el.graph.style.strokeWidth = `${w}px`;
    }
  }

  /**
   * @param {boolean} [immediate] hide the tooltip immediately instead of after `hideDelay`
   */
  resetHover(immediate = false) {
    if (this.tooltip) this.tooltip.hide(immediate ? 0 : undefined);
    this.setHoverSeries(null);
    this.setPointState(-1);
    for (const s of this.series || []) {
      s.el.group?.classList.remove('tsc-inactive');
      if (s.el.group) s.el.group.style.opacity = '';
    }
  }

  // ---------------------------------------------------------------- pointer

  /** @param {MouseEvent|TouchEvent} e */
  onPointerMove(e) {
    if (this.destroyed || !this.categories.length) return;
    const src = 'touches' in e ? e.touches[0] : e;
    if (!src) return;
    const rect = this.inner.getBoundingClientRect();
    const chartX = src.clientX - rect.left;
    const chartY = src.clientY - rect.top;
    this.runPointActions(chartX, chartY);
  }

  onPointerLeave() {
    if (this.destroyed) return;
    this.resetHover(false);
  }

  /**
   * Find the hovered category (nearest x) and the hovered series (nearest point), update states & tooltip.
   * @param {number} chartX
   * @param {number} chartY
   */
  runPointActions(chartX, chartY) {
    // nearest category by x among those that have at least one point
    let index = -1;
    let best = Infinity;
    this.xPositions.forEach((x, i) => {
      const d = Math.abs(x - chartX);
      if (d < best && this.series.some((s) => s.points[i])) { best = d; index = i; }
    });
    if (index < 0) return;

    // points at that x
    const points = this.series.filter((s) => s.points[index]);

    // hovered series: nearest by distance; later series win ties (they are drawn on top)
    let hoverSeries = null;
    let bestDist = Infinity;
    for (const s of points) {
      const p = s.points[index];
      const d = (p.x - chartX) ** 2 + (p.y - chartY) ** 2;
      if (d <= bestDist) { bestDist = d; hoverSeries = s; }
    }

    const changed = index !== this.hoverIndex || hoverSeries !== this.hoverSeries || (this.tooltip && this.tooltip.isHidden);
    if (!changed) return;

    this.setPointState(index);
    this.setHoverSeries(hoverSeries);

    if (this.tooltip) {
      const lang = this.options.tooltip;
      const tooltipPoints = points.map((s) => ({
        series: s,
        name: s.name,
        color: s.color,
        y: s.values[index],
        formatted: formatValue(s.values[index], s.conf, lang),
      }));
      // anchor: x of the category; y follows the mouse when several points share the tooltip
      const anchorX = Math.round(this.xPositions[index]);
      const anchorY = Math.round(points.length > 1 ? chartY : points[0].points[index].y);
      this.tooltip.refresh({
        category: this.categories[index],
        index,
        points: tooltipPoints,
        anchorX,
        anchorY,
        negative: hoverSeries.values[index] < 0,
      });
    }
  }
}

// -------------------------------------------------------------------- helpers

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) setAttrs(el, attrs);
  return el;
}

function setAttrs(el, attrs) {
  for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (v === null || v === undefined) el.removeAttribute(k);
    else el.setAttribute(k, String(v));
  }
}

/** @param {Array<{x:number,y:number}|null>} pts */
function polylinePath(pts) {
  let d = '';
  let pen = false;
  for (const p of pts) {
    if (!p) { pen = false; continue; }
    d += `${pen ? ' L' : ' M'} ${r2(p.x)} ${r2(p.y)}`;
    pen = true;
  }
  return d.trim();
}

/**
 * Area fill path: the graph line closed down to the zero line, one sub-path per run of points.
 * @param {Array<{x:number,y:number}|null>} pts
 * @param {number} zero
 * @param {string} type
 */
function areaPath(pts, zero, type) {
  const runs = [];
  let cur = [];
  for (const p of pts) {
    if (p) cur.push(p);
    else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  return runs.map((run) => {
    const top = type === 'spline' ? splinePath(run) : polylinePath(run);
    const first = run[0];
    const last = run[run.length - 1];
    return `${top} L ${r2(last.x)} ${r2(zero)} L ${r2(first.x)} ${r2(zero)} Z`;
  }).join(' ');
}

/**
 * Bar with optionally rounded end corners.
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number} rTop @param {number} rBottom
 */
function barPath(x, y, w, h, rTop, rBottom) {
  const rt = Math.max(0, Math.min(rTop || 0, w / 2, h));
  const rb = Math.max(0, Math.min(rBottom || 0, w / 2, h));
  return [
    `M ${x} ${y + rt}`,
    rt ? `A ${rt} ${rt} 0 0 1 ${x + rt} ${y}` : '',
    `L ${x + w - rt} ${y}`,
    rt ? `A ${rt} ${rt} 0 0 1 ${x + w} ${y + rt}` : '',
    `L ${x + w} ${y + h - rb}`,
    rb ? `A ${rb} ${rb} 0 0 1 ${x + w - rb} ${y + h}` : '',
    `L ${x + rb} ${y + h}`,
    rb ? `A ${rb} ${rb} 0 0 1 ${x} ${y + h - rb}` : '',
    'Z',
  ].filter(Boolean).join(' ');
}

const r2 = (n) => Math.round(n * 100) / 100;

/** x of a data item: [x, y] | {x, y} | plain value (→ index) */
function pointX(item, i) {
  if (Array.isArray(item)) return item[0];
  if (item && typeof item === 'object' && !(item instanceof Date)) return item.x ?? i;
  return i;
}

/** y of a data item */
function pointY(item) {
  if (Array.isArray(item)) return item[1];
  if (item && typeof item === 'object' && !(item instanceof Date)) return item.y;
  return item;
}

function toY(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? parseFloat(v) : +v;
  return isNumber(n) ? n : null;
}

/**
 * Canonical key of an x value, so that a Date, a timestamp and an ISO string
 * describing the same moment collapse into one category.
 * @param {unknown} x
 */
function xKey(x) {
  if (x instanceof Date) return x.getTime();
  if (typeof x === 'number') return x;
  if (typeof x === 'string') {
    const d = parseDateString(x);
    if (d) return d.getTime();
  }
  return x;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 'YYYY-MM-DD' → calendar date (local, timezone-safe); full ISO date-time → Date; otherwise null.
 * @param {string} x
 */
function parseDateString(x) {
  const m = DATE_ONLY.exec(x);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(x)) {
    const d = new Date(x);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Category label: dates → dd.mm.yyyy, everything else → string.
 * @param {unknown} x
 * @param {string} format
 * @param {boolean} utc  format Date objects / timestamps in UTC instead of local time
 */
function formatX(x, format, utc) {
  if (x instanceof Date) return formatDate(x, format, utc);
  if (typeof x === 'number' && Math.abs(x) > 1e11) return formatDate(x, format, utc); // looks like a ms timestamp
  if (typeof x === 'string') {
    const d = parseDateString(x);
    if (d) return formatDate(d, format, DATE_ONLY.test(x) ? false : utc);
  }
  return String(x);
}
