/**
 * Small helpers: easing, animation loop, colors, number/date formatting.
 * No dependencies.
 */

/** @param {number} t */
export const easeInOutSine = (t) => -0.5 * (Math.cos(Math.PI * t) - 1);
/** @param {number} t */
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
/** @param {number} t */
export const linear = (t) => t;

/**
 * Run a requestAnimationFrame based animation.
 * `onFrame` receives the eased position in [0..1]; it is always called with 1 at the end.
 *
 * @param {number} duration      milliseconds; 0 → apply the final state synchronously
 * @param {(t:number)=>number} easing
 * @param {(pos:number, raw:number)=>void} onFrame
 * @param {() => void} [onComplete]
 * @returns {{ cancel: () => void }}
 */
export function animate(duration, easing, onFrame, onComplete) {
  if (!(duration > 0) || typeof requestAnimationFrame !== 'function') {
    onFrame(1, 1);
    if (onComplete) onComplete();
    return { cancel() {} };
  }
  let start = null;
  let raf = 0;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    clearTimeout(safety);
    onFrame(1, 1);
    if (onComplete) onComplete();
  };
  const step = (now) => {
    if (done) return;
    if (start === null) start = now;
    const raw = Math.min(1, (now - start) / duration);
    if (raw >= 1) return finish();
    onFrame(easing(raw), raw);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  // rAF is paused in hidden tabs — make sure the final state is applied anyway
  const safety = setTimeout(finish, duration + 250);
  return {
    cancel() {
      done = true;
      cancelAnimationFrame(raf);
      clearTimeout(safety);
    },
  };
}

/** @param {number} v @param {number} a @param {number} b */
export const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

/**
 * Parse #rgb, #rrggbb, #rrggbbaa, rgb(), rgba() → [r, g, b, a]; null for anything else (named colours, hsl…).
 * @param {string} color
 * @returns {[number, number, number, number] | null}
 */
export function parseColor(color) {
  const c = String(color).trim();
  let m = c.match(/^#([0-9a-f]{3,4})$/i);
  if (m) {
    const h = m[1];
    const r = parseInt(h[0] + h[0], 16), g = parseInt(h[1] + h[1], 16), b = parseInt(h[2] + h[2], 16);
    const a = h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1;
    return [r, g, b, a];
  }
  m = c.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) {
    const h = m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), m[2] ? parseInt(m[2], 16) / 255 : 1];
  }
  m = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  return null;
}

/**
 * Highcharts-like `Color.brighten(alpha)`: shifts every channel by alpha * 255.
 * @param {string} color
 * @param {number} alpha  e.g. 0.1 → lighter, -0.1 → darker
 */
export function brighten(color, alpha) {
  const parsed = parseColor(color);
  if (!parsed) return color; // unknown notation: leave it as is rather than guess
  const [r, g, b, a] = parsed;
  const f = (v) => clamp(Math.round(v + alpha * 255), 0, 255);
  return `rgba(${f(r)},${f(g)},${f(b)},${a})`;
}

/**
 * Highcharts-like number formatting: "1 234.50".
 * @param {number} value
 * @param {number} [decimals]  undefined → keep the value's own decimals
 * @param {string} [decimalPoint]
 * @param {string} [thousandsSep]
 */
export function formatNumber(value, decimals, decimalPoint = '.', thousandsSep = ' ') {
  const num = +value;
  if (!isFinite(num)) return String(value);
  const dec = decimals == null || decimals < 0
    ? Math.min((String(num).split('.')[1] || '').length, 20)
    : decimals;
  const abs = Math.abs(num);
  const fixed = abs.toFixed(dec);
  const [intPart, fracPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep);
  return (num < 0 ? '-' : '') + grouped + (fracPart ? decimalPoint + fracPart : '');
}

const pad2 = (n) => (n < 10 ? '0' : '') + n;

/**
 * Format a Date / timestamp as dd.mm.yyyy (the format used in the reference chart).
 * Tokens: dd, mm, yyyy, yy, HH, MM.
 * @param {Date|number} date
 * @param {string} [format]
 * @param {boolean} [utc]  use UTC instead of local time
 */
export function formatDate(date, format = 'dd.mm.yyyy', utc = false) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return String(date);
  const year = utc ? d.getUTCFullYear() : d.getFullYear();
  const month = utc ? d.getUTCMonth() : d.getMonth();
  const day = utc ? d.getUTCDate() : d.getDate();
  const hours = utc ? d.getUTCHours() : d.getHours();
  const minutes = utc ? d.getUTCMinutes() : d.getMinutes();
  return format
    .replace('yyyy', String(year))
    .replace('yy', String(year).slice(-2))
    .replace('mm', pad2(month + 1))
    .replace('dd', pad2(day))
    .replace('HH', pad2(hours))
    .replace('MM', pad2(minutes));
}

/** @param {unknown} v */
export const isNumber = (v) => typeof v === 'number' && isFinite(v);

/** Deep-ish merge of plain objects (arrays and non-plain values are replaced). */
export function merge(...sources) {
  const out = {};
  for (const src of sources) {
    if (!src) continue;
    for (const key of Object.keys(src)) {
      const val = src[key];
      if (val === undefined) continue; // an explicit undefined never wipes a default
      if (isPlainObject(val) && isPlainObject(out[key])) out[key] = merge(out[key], val);
      else if (isPlainObject(val)) out[key] = merge(val);
      else out[key] = val;
    }
  }
  return out;
}

/** @param {unknown} v */
export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
}

let uid = 0;
/** Unique id for SVG defs. */
export const uniqueId = (prefix = 'tsc') => `${prefix}-${++uid}-${Math.random().toString(36).slice(2, 7)}`;
