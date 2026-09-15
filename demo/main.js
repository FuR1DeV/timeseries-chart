import { TimeSeriesChart } from '../src/index.js';

// ---------------------------------------------------------------------------
// Four time-series. Each item is [date, value]; dates may be Date objects,
// timestamps or ISO strings — the chart derives and formats the x categories.
// (Values are the ones visible in the reference recording.)
// ---------------------------------------------------------------------------
const dates = ['2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14'];
const zip = (values) => values.map((v, i) => [dates[i], v]);

const referenceData = {
  cost: zip([2.04, 25.85, 44.36, 55.65, 63.75]),
  cpa: zip([0.68, 0.86, 1.23, 0.79, 0.71]),
  roi: zip([610.78, 180.5, 161.47, 56.33, 357.25]),
  conversions: zip([3, 30, 36, 70, 90]),
};

/** Chart options: 4 series drawn as area, bar, spline and line. */
function buildOptions(data) {
  return {
    series: [
      { type: 'area', name: 'Cost', data: data.cost, valueDecimals: 2, yAxis: 'money' },
      { type: 'bar', name: 'CPA', data: data.cpa, valueDecimals: 2, yAxis: 'money' },
      { type: 'spline', name: 'ROI confirmed', data: data.roi, valueDecimals: 2 },
      { type: 'line', name: 'Conversions', data: data.conversions, valueDecimals: 0 },
    ],
  };
}

const chart = new TimeSeriesChart('chart', buildOptions(referenceData));
const small = new TimeSeriesChart('chart-small', buildOptions(referenceData));

// --- demo controls ----------------------------------------------------------
const rnd = (min, max, decimals = 2) => +(min + Math.random() * (max - min)).toFixed(decimals);
const randomData = () => ({
  cost: zip(dates.map(() => rnd(0, 80))),
  cpa: zip(dates.map(() => rnd(0.3, 2))),
  roi: zip(dates.map(() => rnd(20, 700))),
  conversions: zip(dates.map(() => rnd(0, 100, 0))),
});

document.getElementById('randomize').addEventListener('click', () => {
  const data = randomData();
  chart.update(buildOptions(data), true);
  small.update(buildOptions(data), true);
});
document.getElementById('reset').addEventListener('click', () => {
  chart.update(buildOptions(referenceData), true);
  small.update(buildOptions(referenceData), true);
});

// expose for playing in the console
window.chart = chart;
window.chartSmall = small;
