/**
 * Y-axis extremes / tick computation.
 *
 * Mirrors the (well known) Highcharts algorithm so that the chart scales
 * exactly like the reference:
 *   - 5 % min/max padding, but never below the threshold (0) for positive data
 *   - "nice" tick interval (1, 2, 2.5, 5, 10 × magnitude)
 *   - when several hidden y-axes live in one chart their tick counts are
 *     aligned (`alignTicks`), which uses a finer set of multiples
 *     (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10)
 *   - startOnTick / endOnTick
 */

const correctFloat = (n, prec = 14) => parseFloat(n.toPrecision(prec));

/** @param {number} n */
const getMagnitude = (n) => Math.pow(10, Math.floor(Math.log(n) / Math.LN10));

/**
 * @param {number} interval
 * @param {boolean} hasTickAmount
 */
export function normalizeTickInterval(interval, hasTickAmount) {
  const magnitude = getMagnitude(interval);
  const normalized = interval / magnitude;
  const multiples = hasTickAmount
    ? [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
    : [1, 2, 2.5, 5, 10];
  let ret = multiples[multiples.length - 1];
  for (let i = 0; i < multiples.length; i++) {
    ret = multiples[i];
    if (hasTickAmount && ret * magnitude >= interval) break;
    if (!hasTickAmount && normalized <= (multiples[i] + (multiples[i + 1] ?? multiples[i])) / 2) break;
  }
  return correctFloat(ret * magnitude, -Math.round(Math.log(0.001) / Math.LN10));
}

/**
 * @typedef {object} AxisOptions
 * @property {number} plotHeight
 * @property {number} [tickPixelInterval]   default 72
 * @property {number} [minPadding]          default 0.05
 * @property {number} [maxPadding]          default 0.05
 * @property {boolean} [alignTicks]         true → tick amount is derived from the plot height
 * @property {number} [tickAmount]          explicit tick amount
 * @property {number|null} [min]            hard minimum
 * @property {number|null} [max]            hard maximum
 * @property {boolean} [softThreshold]      default true: positive data never pads below 0
 * @property {number} [threshold]           default 0
 */

/**
 * Compute axis extremes and tick positions for a data range.
 *
 * @param {number} dataMin
 * @param {number} dataMax
 * @param {AxisOptions} opts
 * @returns {{ min: number, max: number, tickInterval: number, tickPositions: number[] }}
 */
export function computeAxis(dataMin, dataMax, opts) {
  const tickPixelInterval = opts.tickPixelInterval ?? 72;
  const minPadding = opts.minPadding ?? 0.05;
  const maxPadding = opts.maxPadding ?? 0.05;
  const softThreshold = opts.softThreshold ?? true;
  const threshold = opts.threshold ?? 0;
  const len = Math.max(opts.plotHeight || 0, 1);

  if (!isFinite(dataMin) || !isFinite(dataMax)) {
    dataMin = 0;
    dataMax = 1;
  }

  // softThreshold: the threshold (0) is always part of the axis for data on one side of it
  if (softThreshold) {
    if (dataMin >= threshold) dataMin = threshold;
    else if (dataMax <= threshold) dataMax = threshold;
  }

  let min = dataMin;
  let max = dataMax;

  if (min === max) {
    // flat data: give it some room (Highcharts shows 0..1 for all-zero data)
    if (min === 0) max = 1;
    else {
      min = min > 0 ? 0 : min * 1.05;
      max = max > 0 ? max * 1.05 : 0;
    }
  }

  const length = max - min;
  if (opts.min == null && !(softThreshold && dataMin === threshold && threshold === min)) min -= length * minPadding;
  if (opts.max == null && !(softThreshold && dataMax === threshold && threshold === max)) max += length * maxPadding;
  if (opts.min != null) min = opts.min;
  if (opts.max != null) max = opts.max;

  // tick amount (only when aligning ticks between several axes)
  let tickAmount = opts.tickAmount;
  if (!tickAmount && len < tickPixelInterval) tickAmount = 2;
  if (!tickAmount && opts.alignTicks) tickAmount = Math.ceil(len / tickPixelInterval) + 1;
  if (tickAmount && tickAmount < 4) tickAmount = 5; // Highcharts computes 5 and drops the intermediate ones

  let tickInterval = tickAmount
    ? (max - min) / Math.max(tickAmount - 1, 1)
    : ((max - min) * tickPixelInterval) / Math.max(len, tickPixelInterval);
  if (!(tickInterval > 0)) tickInterval = 1;
  tickInterval = normalizeTickInterval(tickInterval, !!tickAmount);

  const buildTicks = (interval) => {
    const start = opts.min != null ? min : correctFloat(Math.floor(min / interval) * interval);
    const end = opts.max != null ? max : correctFloat(Math.ceil(max / interval) * interval);
    const ticks = [];
    for (let v = start, i = 0; v <= end + interval * 1e-9 && i < 1000; v = correctFloat(v + interval), i++) ticks.push(v);
    if (ticks[ticks.length - 1] < end) ticks.push(end);
    return ticks;
  };

  let tickPositions = buildTicks(tickInterval);

  // adjustTickAmount
  if (tickAmount && opts.min == null && opts.max == null) {
    if (tickPositions.length > tickAmount) {
      tickInterval = correctFloat(tickInterval * 2);
      tickPositions = buildTicks(tickInterval);
    }
    while (tickPositions.length < tickAmount) {
      // extend evenly for both sides unless we're on the threshold
      if (tickPositions.length % 2 || min === threshold) {
        tickPositions.push(correctFloat(tickPositions[tickPositions.length - 1] + tickInterval));
      } else {
        tickPositions.unshift(correctFloat(tickPositions[0] - tickInterval));
      }
    }
  }

  return {
    min: tickPositions[0],
    max: tickPositions[tickPositions.length - 1],
    tickInterval,
    tickPositions,
  };
}
