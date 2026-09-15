/**
 * Browser self-check. Open test/index.html through any static server
 * (`npm run dev` → http://localhost:5173/test/) and every line must be green.
 *
 * The expected values for the reference data come from the reference recording
 * (chart 295×149 px): axis extremes, point positions and tooltip placement.
 */
import { TimeSeriesChart, computeAxis, formatNumber, formatDate, splinePath } from '../src/index.js';

const sandbox = document.getElementById('sandbox');
const list = document.getElementById('results');
const summary = document.getElementById('summary');
let passed = 0;
let failed = 0;

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const assertEq = (actual, expected, msg) => {
  if (!eq(actual, expected)) throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function test(name, fn) {
  const li = document.createElement('li');
  try {
    await fn();
    li.className = 'pass';
    li.textContent = name;
    passed++;
  } catch (e) {
    li.className = 'fail';
    li.textContent = name;
    const pre = document.createElement('pre');
    pre.textContent = e.message;
    li.appendChild(pre);
    failed++;
    console.error(name, e);
  }
  list.appendChild(li);
}

/** Create a chart in a hidden box; returns helpers. */
function make(options, width = 295, height = 149) {
  const host = document.createElement('div');
  host.style.cssText = `width:${width}px;height:${height}px`;
  sandbox.appendChild(host);
  const chart = new TimeSeriesChart(host, { animation: false, ...options });
  const hover = (x, y) => {
    const rect = host.getBoundingClientRect();
    host.dispatchEvent(new MouseEvent('mousemove', { clientX: rect.left + x, clientY: rect.top + y, bubbles: true }));
  };
  const leave = () => host.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
  const tooltipPos = () => [parseFloat(chart.tooltip.el.style.left), parseFloat(chart.tooltip.el.style.top)];
  const box = () => [chart.tooltip.el.offsetWidth, chart.tooltip.el.offsetHeight];
  return { host, chart, hover, leave, tooltipPos, box, destroy() { chart.destroy(); host.remove(); } };
}

const dates = ['2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14'];
const zip = (values) => values.map((v, i) => [dates[i], v]);
const referenceOptions = () => ({
  series: [
    { type: 'area', name: 'Cost', data: zip([2.04, 25.85, 44.36, 55.65, 63.75]), valueDecimals: 2, yAxis: 'money' },
    { type: 'bar', name: 'CPA', data: zip([0.68, 0.86, 1.23, 0.79, 0.71]), valueDecimals: 2, yAxis: 'money' },
    { type: 'spline', name: 'ROI confirmed', data: zip([610.78, 180.5, 161.47, 56.33, 357.25]), valueDecimals: 2 },
    { type: 'line', name: 'Conversions', data: zip([3, 30, 36, 70, 90]), valueDecimals: 0 },
  ],
});

// ---------------------------------------------------------------- reference chart

await test('категории собираются из дат и форматируются как dd.mm.yyyy', () => {
  const t = make(referenceOptions());
  assertEq(t.chart.categories, ['10.06.2026', '11.06.2026', '12.06.2026', '13.06.2026', '14.06.2026'], 'categories');
  t.destroy();
});

await test('точки центрированы в категориях (5 слотов по 59 px)', () => {
  const t = make(referenceOptions());
  assertEq(t.chart.xPositions, [29.5, 88.5, 147.5, 206.5, 265.5], 'xPositions');
  t.destroy();
});

await test('пределы осей как в референсе: Cost/CPA 0–75, ROI 0–750, Conversions 0–120', () => {
  const t = make(referenceOptions());
  const ax = (key) => { const a = t.chart.axes.get(key); return [a.min, a.max]; };
  assertEq(ax('money'), [0, 75], 'money');
  assertEq(ax(2), [0, 750], 'roi');
  assertEq(ax(3), [0, 120], 'conversions');
  t.destroy();
});

await test('стили серий: area 1px + заливка 0.5, spline 3px, line 1px с квадратными маркерами, bar с белой обводкой', () => {
  const t = make(referenceOptions());
  const [area, bar, spline, line] = t.chart.series;
  assertEq(area.el.graph.style.strokeWidth, '1px', 'area lineWidth');
  assertEq(area.el.area.getAttribute('fill-opacity'), '0.5', 'area fillOpacity');
  assertEq(spline.el.graph.style.strokeWidth, '3px', 'spline lineWidth');
  assertEq(line.el.graph.style.strokeWidth, '1px', 'line lineWidth');
  assertEq(line.el.markers[0].tagName, 'rect', 'square marker');
  assertEq(line.el.markers[0].getAttribute('width'), '6', 'marker size');
  assert(spline.el.markers[0].style.display === 'none', 'spline markers hidden until hover');
  assertEq(bar.el.bars[0].getAttribute('stroke'), '#ffffff', 'bar border');
  assertEq(t.chart.svg.querySelector('.tsc-plot-border').getAttribute('stroke'), '#cccccc', 'plot border');
  t.destroy();
});

await test('spline: кривая через все точки без выбросов (плато между 11.06 и 12.06)', () => {
  const d = splinePath([{ x: 0, y: 100 }, { x: 10, y: 20 }, { x: 20, y: 22 }, { x: 30, y: 60 }]);
  assert(d.startsWith('M 0 100 C'), 'starts with M … C');
  // control points must stay within the neighbours' y range → no value below 20 in the plateau segment
  const nums = d.split(/[ ,]/).map(Number).filter((n) => !isNaN(n));
  assert(Math.min(...nums.filter((_, i) => i % 2 === 1)) >= 20, 'no overshoot below the minimum point');
});

// ---------------------------------------------------------------- hover behaviour

await test('наведение: тултип показывает дату и 4 строки «Имя: значение» с нужными десятичными', () => {
  const t = make(referenceOptions());
  t.hover(89, 130);
  const el = t.chart.tooltip.el;
  assert(el.classList.contains('tsc-visible'), 'visible');
  assertEq(el.querySelector('.tsc-tooltip-header').textContent, '11.06.2026', 'header');
  const rows = [...el.querySelectorAll('.tsc-tooltip-point')].map((r) => r.textContent.replace('● ', ''));
  assertEq(rows, ['Cost: 25.85', 'CPA: 0.86', 'ROI confirmed: 180.50', 'Conversions: 30'], 'rows');
  assertEq([...el.querySelectorAll('b')].map((b) => b.textContent), ['25.85', '0.86', '180.50', '30'], 'bold values');
  t.destroy();
});

await test('позиция тултипа: первая точка → справа от неё; у нижнего края → прижат к низу', () => {
  const t = make(referenceOptions());
  t.hover(89, 130);
  assertEq(t.tooltipPos(), [105, 149 - t.box()[1] - 2], 'aligned right of x=89 (+16) and clamped to the bottom');
  t.destroy();
});

await test('позиция тултипа: последняя точка → слева от неё, по вертикали по центру курсора', () => {
  const t = make(referenceOptions());
  t.hover(266, 60);
  const [w, h] = t.box();
  assertEq(t.tooltipPos(), [266 - 16 - w, Math.round(60 - h / 2)], 'aligned left');
  t.destroy();
});

await test('позиция тултипа: средняя точка, курсор в середине → некуда ставить → левый верхний угол (0,0)', () => {
  const t = make(referenceOptions());
  t.hover(148, 75);
  assertEq(t.tooltipPos(), [0, 0], 'fallback');
  t.destroy();
});

await test('позиция тултипа: курсор у верхнего края → под курсором, x по левому краю (как в записи)', () => {
  const t = make(referenceOptions());
  t.hover(30, 5);
  assertEq(t.tooltipPos(), [1, 21], 'swapped dimensions');
  t.destroy();
});

await test('позиция тултипа: курсор у нижнего края → над курсором, x по центру точки', () => {
  const t = make(referenceOptions());
  t.hover(207, 140);
  const [w, h] = t.box();
  assertEq(t.tooltipPos(), [Math.round(207 - w / 2), 140 - 16 - h], 'above the pointer');
  t.destroy();
});

await test('тултип переезжает с анимацией, первое появление — без анимации', () => {
  const t = make(referenceOptions());
  t.hover(89, 130);
  assert(!t.chart.tooltip.el.classList.contains('tsc-animate'), 'first show is instant');
  t.hover(266, 60);
  assert(t.chart.tooltip.el.classList.contains('tsc-animate'), 'subsequent moves animate');
  t.destroy();
});

await test('наведение: halo у всех точек кроме bar, маркеры увеличиваются, столбец светлеет', () => {
  const t = make(referenceOptions());
  t.hover(148, 75);
  const [area, bar, spline, line] = t.chart.series;
  for (const s of [area, spline, line]) {
    assert(s.el.halo && s.el.halo.style.display !== 'none', `${s.name}: halo shown`);
    assertEq([+s.el.halo.getAttribute('cx'), +s.el.halo.getAttribute('r')], [147.5, 10], `${s.name}: halo position/size`);
  }
  assert(!bar.el.halo, 'bars have no halo');
  assertEq(line.el.markers[2].getAttribute('width'), '8', 'hovered marker grows (r 3 → 4)');
  assertEq(line.el.markers[2].getAttribute('stroke'), '#ffffff', 'hovered marker gets a white outline');
  assert(spline.el.markers[2].style.display === '', 'spline marker appears on hover');
  assert(bar.el.bars[2].getAttribute('fill') !== bar.color, 'hovered bar is brightened');
  assertEq(bar.el.bars[1].getAttribute('fill'), bar.color, 'other bars unchanged');
  t.destroy();
});

await test('ближайшая к курсору серия переходит в hover: её линия становится 1px, остальные не меняются', () => {
  const t = make(referenceOptions());
  t.hover(89, 130); // closest point here is the ROI spline
  assertEq(t.chart.hoverSeries.name, 'ROI confirmed', 'hover series');
  assertEq(t.chart.series[2].el.graph.style.strokeWidth, '1px', 'spline thinned');
  t.hover(148, 75); // closest is the Cost area
  assertEq(t.chart.hoverSeries.name, 'Cost', 'hover series changed');
  assertEq(t.chart.series[2].el.graph.style.strokeWidth, '3px', 'spline back to 3px');
  t.destroy();
});

await test('уход курсора: состояния сбрасываются сразу, тултип скрывается через 500 мс', async () => {
  const t = make(referenceOptions());
  t.hover(89, 130);
  t.leave();
  assertEq(t.chart.hoverIndex, -1, 'hover reset');
  assert(!t.chart.tooltip.isHidden, 'still visible right after leaving');
  await sleep(600);
  assert(t.chart.tooltip.isHidden, 'hidden after hideDelay');
  assert(!t.chart.tooltip.el.classList.contains('tsc-visible'), 'class removed');
  t.destroy();
});

await test('анимация появления: линии раскрываются слева направо, столбцы растут', async () => {
  const t = make({ ...referenceOptions(), animation: { duration: 200 } });
  t.chart.update({}, true);
  assertEq(t.chart.clipRect.getAttribute('width'), '0', 'clip starts at 0');
  assert(t.chart.series[1].el.barGroup.getAttribute('transform').includes('scale(1 0.001)'), 'bars start collapsed');
  await sleep(600);
  assertEq(+t.chart.clipRect.getAttribute('width'), t.chart.plotWidth, 'clip fully open');
  assertEq(t.chart.series[1].el.barGroup.getAttribute('transform'), '', 'bars restored');
  t.destroy();
});

// ---------------------------------------------------------------- data handling

await test('данные: Date, timestamp и ISO-строка одного дня попадают в одну категорию', () => {
  const t = make({ series: [
    { type: 'line', data: [[new Date(2026, 0, 1), 1], ['2026-01-02', 2]] },
    { type: 'bar', data: [['2026-01-01', 5], [new Date(2026, 0, 2).getTime(), 6]] },
  ] });
  assertEq(t.chart.categories, ['01.01.2026', '02.01.2026'], 'two categories');
  assertEq(t.chart.series.map((s) => s.values), [[1, 2], [5, 6]], 'values aligned');
  t.destroy();
});

await test('данные: строка "YYYY-MM-DD" даёт ту же дату в любом часовом поясе', () => {
  const t = make({ series: [{ type: 'line', data: [['2026-06-10', 1]] }] });
  assertEq(t.chart.categories, ['10.06.2026'], 'label');
  assertEq(formatDate(Date.UTC(2026, 5, 10), 'dd.mm.yyyy', true), '10.06.2026', 'UTC formatting');
  t.destroy();
});

await test('данные: null → разрыв линии, серия приглушается, в тултипе её нет', () => {
  const t = make({ categories: ['a', 'b', 'c', 'd'], series: [
    { type: 'area', name: 'A', data: [1, 2, null, 4] },
    { type: 'line', name: 'B', data: [3, 3, 2, 5] },
  ] });
  assert(t.chart.series[0].el.graph.getAttribute('d').includes(' M '), 'gap in the path');
  t.hover(t.chart.xPositions[2], 50);
  assert(t.chart.series[0].el.group.classList.contains('tsc-inactive'), 'inactive');
  assertEq(t.chart.tooltip.el.querySelectorAll('.tsc-tooltip-point').length, 1, 'one row');
  t.destroy();
});

await test('данные: строки-числа парсятся, мусор → null; дубликаты x — последнее значение', () => {
  const t = make({ series: [{ type: 'line', data: [['x', '1.5'], ['y', 'abc'], ['z', NaN], ['x', 7]] }] });
  assertEq(t.chart.categories, ['x', 'y', 'z'], 'categories');
  assertEq(t.chart.series[0].values, [7, null, null], 'values');
  t.destroy();
});

await test('данные: пустой список серий, пустые данные, все null — без ошибок', () => {
  for (const series of [[], [{ type: 'line', data: [] }], [{ type: 'bar', data: [null, null] }]]) {
    const t = make({ series });
    t.hover(50, 50);
    t.leave();
    t.destroy();
  }
});

await test('оси: отрицательные и смешанные данные, плоские данные', () => {
  const neg = computeAxis(-10, -3, { plotHeight: 149 });
  assertEq([neg.min, neg.max], [-15, 0], 'negative only: padded min -10.5 floors to the -15 tick');
  const mixed = computeAxis(-5, 3, { plotHeight: 149 });
  assertEq([mixed.min, mixed.max], [-10, 5], 'mixed');
  const flat = computeAxis(5, 5, { plotHeight: 149 });
  assert(flat.min <= 5 && flat.max > 5, 'flat data has room');
  const zero = computeAxis(0, 0, { plotHeight: 149 });
  assertEq([zero.min, zero.max], [0, 1], 'all zero');
});

await test('оси: alignTicks даёт 4 деления при высоте 149 px и «тонкие» шаги (0, 40, 80, 120 для max 90)', () => {
  const a = computeAxis(3, 90, { plotHeight: 149, alignTicks: true });
  assertEq(a.tickPositions, [0, 40, 80, 120], 'ticks');
});

await test('оси: ручные min/max через yAxes', () => {
  const t = make({ yAxes: { m: { min: 0, max: 100 } }, series: [{ type: 'line', yAxis: 'm', data: [10, 20] }] });
  const a = t.chart.axes.get('m');
  assertEq([a.min, a.max], [0, 100], 'fixed extremes');
  t.destroy();
});

await test('форматирование чисел: разделитель тысяч и десятичные', () => {
  assertEq(formatNumber(1234567.891, 2), '1 234 567.89', 'decimals');
  assertEq(formatNumber(-42.5), '-42.5', 'negative, own decimals');
  assertEq(formatNumber(180.5, 2), '180.50', 'trailing zero');
});

await test('тултип экранирует HTML в названиях серий', () => {
  const t = make({ series: [{ type: 'line', name: '<img src=x onerror="alert(1)">', data: [1, 2] }] });
  t.hover(30, 50);
  assert(t.chart.tooltip.el.querySelector('img') === null, 'no injected element');
  assert(t.chart.tooltip.el.textContent.includes('<img'), 'shown as text');
  t.destroy();
});

// ---------------------------------------------------------------- lifecycle

await test('update / setData перерисовывают график с новыми данными', () => {
  const t = make(referenceOptions());
  t.chart.setData([zip([1, 2, 3, 4, 5]), zip([1, 1, 1, 1, 1]), zip([9, 8, 7, 6, 5]), zip([0, 0, 0, 0, 1])]);
  assertEq(t.chart.series[0].values, [1, 2, 3, 4, 5], 'setData');
  t.chart.update({ series: [{ type: 'line', data: [1, 2, 3] }] });
  assertEq([t.chart.series.length, t.chart.categories.length], [1, 3], 'update replaces series');
  t.destroy();
});

await test('setSize и reflow меняют размеры plot-области', () => {
  const t = make(referenceOptions());
  t.chart.setSize(400, 200);
  assertEq([t.chart.chartWidth, t.chart.chartHeight, t.chart.plotWidth], [400, 200, 400], 'setSize');
  t.destroy();
});

await test('destroy убирает SVG, тултип и обработчики; методы после destroy безопасны', () => {
  const t = make(referenceOptions());
  t.chart.destroy();
  assert(t.host.querySelector('svg') === null, 'svg removed');
  assert(t.host.querySelector('.tsc-tooltip') === null, 'tooltip removed');
  t.hover(50, 50);
  t.chart.update({ series: [] });
  t.chart.reflow();
  t.host.remove();
});

// ---------------------------------------------------------------- robustness (review findings)

await test('контейнер с padding и border: график занимает content box, курсор и тултип не смещены', async () => {
  const host = document.createElement('div');
  host.style.cssText = 'width:320px;height:180px;padding:10px;border:5px solid #999;box-sizing:content-box';
  sandbox.appendChild(host);
  const chart = new TimeSeriesChart(host, { animation: false, ...referenceOptions() });
  assertEq([chart.chartWidth, chart.chartHeight], [320, 180], 'content box size');
  const inner = host.querySelector('.tsc-inner').getBoundingClientRect();
  host.dispatchEvent(new MouseEvent('mousemove', { clientX: inner.left + 96, clientY: inner.top + 90, bubbles: true }));
  assertEq(chart.hoverIndex, 1, 'pointer maps to the second category (centre x = 96)');
  assert(host.querySelector('.tsc-inner .tsc-tooltip'), 'tooltip lives inside the inner box');
  await sleep(100); // ResizeObserver must not re-render in a loop
  assertEq([chart.chartWidth, chart.chartHeight], [320, 180], 'size stable');
  chart.destroy();
  host.remove();
});

await test('контейнер без высоты, но с padding: размер по умолчанию, без бесконечного роста', async () => {
  const host = document.createElement('div');
  host.style.cssText = 'width:300px;padding:10px';
  sandbox.appendChild(host);
  const chart = new TimeSeriesChart(host, { animation: false, series: [{ type: 'line', data: [1, 2, 3] }] });
  assertEq(chart.chartHeight, 400, 'default height');
  await sleep(150);
  assertEq([chart.chartWidth, chart.chartHeight, host.offsetHeight], [300, 400, 420], 'stable after ResizeObserver');
  chart.destroy();
  host.remove();
});

await test('явный undefined в опциях не затирает значения по умолчанию', () => {
  const t = make({ spacing: undefined, colors: undefined, states: undefined, series: [{ type: 'line', data: [1, 2], marker: undefined }] });
  assertEq([t.chart.plotLeft, t.chart.plotWidth], [0, 295], 'spacing default');
  assertEq(t.chart.series[0].color, '#fef691', 'palette default');
  assertEq(t.chart.series[0].el.markers[0].tagName, 'rect', 'marker default');
  t.destroy();
});

await test('именованный цвет столбцов не превращается в чёрный при наведении', () => {
  const t = make({ series: [{ type: 'bar', color: 'steelblue', data: [1, 2, 3] }, { type: 'line', data: [1, 2, 3] }] });
  t.hover(t.chart.xPositions[1], 140);
  assertEq(t.chart.series[0].el.bars[1].getAttribute('fill'), 'steelblue', 'unchanged colour');
  t.destroy();
});

await test('категория, где у всех серий null, пропускается: выбирается ближайшая с данными', () => {
  const t = make({ categories: ['a', 'b', 'c'], series: [{ type: 'line', data: [1, null, 3] }, { type: 'bar', data: [2, null, 1] }] });
  t.hover(t.chart.xPositions[1] + 2, 50);
  assertEq(t.chart.hoverIndex, 2, 'nearest category with data');
  t.destroy();
});

await test('update({ tooltip: { enabled } }) включает и выключает тултип', () => {
  const t = make({ series: [{ type: 'line', data: [1, 2] }] });
  t.chart.update({ tooltip: { enabled: false } });
  assert(t.chart.tooltip === null && !t.host.querySelector('.tsc-tooltip'), 'disabled');
  t.hover(30, 50);
  t.chart.update({ tooltip: { enabled: true } });
  t.hover(30, 50);
  assert(t.chart.tooltip && t.chart.tooltip.el.classList.contains('tsc-visible'), 're-enabled');
  t.destroy();
});

await test('ручной min выше данных не ломает ось (нет NaN)', () => {
  const a = computeAxis(0, 50, { plotHeight: 300, alignTicks: true, min: 100 });
  assert(isFinite(a.min) && isFinite(a.max) && a.max > a.min, `finite extremes: ${a.min}..${a.max}`);
  const t = make({ yAxes: { 0: { min: 100 } }, series: [{ type: 'line', data: [10, 20] }] });
  assert(!t.chart.series[0].el.graph.getAttribute('d').includes('NaN'), 'path without NaN');
  t.destroy();
});

await test('animation: { duration: 0 } рисует сразу; одиночная точка spline видна как маркер', () => {
  const t = make({ animation: { duration: 0 }, series: [{ type: 'spline', data: [[1, 5]] }, { type: 'line', data: [[1, 2], [2, 3]] }] });
  t.chart.update({}, true);
  assertEq(+t.chart.clipRect.getAttribute('width'), t.chart.plotWidth, 'clip fully open at once');
  assert(t.chart.series[0].el.markers[0].style.display === '', 'single-point series shows its marker');
  assert(t.chart.series[1].el.markerGroup.getAttribute('clip-path') === null, 'marker clip removed after the animation');
  t.destroy();
});

// ---------------------------------------------------------------- summary

summary.textContent = failed ? `Провалено ${failed} из ${passed + failed}` : `Все ${passed} проверок пройдены`;
summary.className = failed ? 'fail' : 'pass';
document.title = (failed ? 'FAIL ' : 'PASS ') + document.title;
window.__testResults = { passed, failed };
