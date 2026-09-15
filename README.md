# timeseries-chart

Лёгкий SVG-график без зависимостей: принимает четыре time-series и рисует их
разными способами — **area**, **spline**, **line**, **bar** — с общим тултипом,
подсветкой точек и анимациями, как в референсе.

- чистый ES-модуль (~25 KB исходников), без шага сборки и без runtime-зависимостей;
- типы для TypeScript (`src/index.d.ts`);
- работает в любом фреймворке (React / Vue / vanilla) — компонент принимает DOM-элемент.

## Быстрый старт

```bash
git clone <repo-url> timeseries-chart
cd timeseries-chart
npm install      # ставит только vite (dev-сервер)
npm run dev      # http://localhost:5173 — демо с данными из референса
```

Сборка не нужна: библиотека — это нативные ES-модули. Если Node.js нет,
демо можно открыть любым статическим сервером, например:

```bash
python -m http.server 5173
```

и зайти на `http://localhost:5173`.

## Инициализация с четырьмя последовательностями

```html
<div id="chart" style="width: 600px; height: 300px"></div>

<script type="module">
  import { TimeSeriesChart } from './src/index.js';

  // каждая последовательность — массив пар [дата, значение]
  const cost        = [['2026-06-10', 2.04],   ['2026-06-11', 25.85], ['2026-06-12', 44.36],  ['2026-06-13', 55.65], ['2026-06-14', 63.75]];
  const cpa         = [['2026-06-10', 0.68],   ['2026-06-11', 0.86],  ['2026-06-12', 1.23],   ['2026-06-13', 0.79],  ['2026-06-14', 0.71]];
  const roi         = [['2026-06-10', 610.78], ['2026-06-11', 180.5], ['2026-06-12', 161.47], ['2026-06-13', 56.33], ['2026-06-14', 357.25]];
  const conversions = [['2026-06-10', 3],      ['2026-06-11', 30],    ['2026-06-12', 36],     ['2026-06-13', 70],    ['2026-06-14', 90]];

  const chart = new TimeSeriesChart('chart', {
    series: [
      { type: 'area',   name: 'Cost',          data: cost,        valueDecimals: 2, yAxis: 'money' },
      { type: 'bar',    name: 'CPA',           data: cpa,         valueDecimals: 2, yAxis: 'money' },
      { type: 'spline', name: 'ROI confirmed', data: roi,         valueDecimals: 2 },
      { type: 'line',   name: 'Conversions',   data: conversions, valueDecimals: 0 },
    ],
  });
</script>
```

Дата в паре может быть `Date`, timestamp'ом (мс) или ISO-строкой — график сам
собирает общую ось X из всех последовательностей (одна и та же дата в разных
форматах попадает в одну категорию) и подписывает её как `dd.mm.yyyy`.
Строки вида `YYYY-MM-DD` трактуются как календарная дата и не зависят от
часового пояса; `Date` и timestamp'ы форматируются в локальном времени
(опция `useUTC: true` переключает на UTC). Значение `null` даёт разрыв линии.

### Формат данных

Любой из вариантов:

```js
data: [[x, y], [x, y], ...]          // пары
data: [{ x, y }, { x, y }, ...]      // объекты
data: [y, y, y, ...]                 // только значения — тогда задайте categories
```

```js
new TimeSeriesChart(el, {
  categories: ['10.06.2026', '11.06.2026', '12.06.2026'],
  series: [
    { type: 'area',   name: 'Cost', data: [2.04, 25.85, 44.36] },
    ...
  ],
});
```

### Шкалы

У каждой серии по умолчанию **своя скрытая ось Y**, растянутая под её данные
(так все четыре серии видны в одном масштабе). Чтобы две серии делили одну
шкалу, дайте им одинаковый ключ `yAxis` (в примере Cost и CPA — обе в деньгах).

Максимум оси считается по тому же алгоритму, что и в референсе: 5 % отступ,
«красивые» шаги (1, 2, 2.5, 5 × 10ⁿ) и выравнивание числа делений между
осями. Пределы можно зафиксировать вручную:

```js
yAxes: { money: { min: 0, max: 100 } }
```

### API

```js
chart.update({ series: [...] }, true);   // заменить опции; true — с анимацией появления
chart.setData([cost, cpa, roi, conv]);    // только данные, в порядке series
chart.setSize(800, 400);
chart.reflow();                           // размер контейнера отслеживается и автоматически (ResizeObserver)
chart.destroy();
```

### Основные опции

| Опция | По умолчанию | Описание |
| --- | --- | --- |
| `width`, `height` | размер контейнера | фиксированный размер |
| `spacing` | `0` | отступ от края контейнера до plot-области (число или `[t, r, b, l]`) |
| `plotBorderWidth`, `plotBorderColor` | `1`, `#cccccc` | рамка plot-области |
| `colors` | жёлтый / синий / зелёный / фиолетовый | палитра для серий без `color` |
| `animation` | `{ duration: 1000 }` | анимация появления; `false` — выключить |
| `xFormat` | `'dd.mm.yyyy'` | формат подписей дат или функция `(x) => string` |
| `useUTC` | `false` | форматировать `Date`/timestamp в UTC вместо локального времени |
| `tooltip.formatter` | — | своя разметка тултипа `(ctx) => html` |
| `tooltip.hideDelay` | `500` | задержка перед скрытием тултипа |
| `states.hover.lineWidth` | `1` | толщина линии наведённой серии |

Опции серии: `type`, `name`, `color`, `data`, `yAxis`, `valueDecimals`,
`valuePrefix`/`valueSuffix`, `lineWidth`, `dashStyle`, `fillOpacity`,
`marker: { enabled, symbol: 'circle' | 'square', radius }`, для bar —
`borderRadius`, `pointPadding`, `groupPadding`, `pointWidth`.
Полный список — в `src/index.d.ts`.

## Что повторено из референса

- Плоская plot-область с серой рамкой, без осей, сетки и легенды.
- Area с полупрозрачной заливкой, толстый spline, тонкая line с квадратными
  маркерами, узкие bar с белой обводкой; точки центрированы в категориях.
- Общий тултип: дата, цветной маркер, `Имя: **значение**`, белый фон с тенью;
  ставится слева от точки (если помещается), иначе справа/по центру, по
  вертикали следует за курсором; плавно переезжает между точками
  (300 мс, ease-out) и исчезает через 500 мс после ухода курсора.
- При наведении: halo вокруг точек всех серий, увеличение маркеров, подсветка
  столбца; ближайшая к курсору серия переключается в hover-состояние
  (линия становится тонкой, 150 мс туда / 500 мс обратно).
- Анимация появления: линии «прорисовываются» слева направо, столбцы растут.
- Серии без значения в наведённой точке приглушаются.

## Самопроверка

В репозитории есть страница с автотестами, которая запускается прямо в
браузере (без Node): откройте `http://localhost:5173/test/` после
`npm run dev` (или того же `python -m http.server`). Каждая строка должна быть
зелёной: проверяются пределы осей и позиции точек на данных референса, все
правила размещения тултипа, hover-состояния, анимация, обработка дат/`null`,
экранирование HTML и жизненный цикл (`update` / `setData` / `destroy`).

## Использование в React

```jsx
import { useEffect, useRef } from 'react';
import { TimeSeriesChart } from 'timeseries-chart';

export function Chart({ series }) {
  const ref = useRef(null);
  const chart = useRef(null);

  useEffect(() => {
    chart.current = new TimeSeriesChart(ref.current, { series });
    return () => chart.current.destroy();
  }, []);

  useEffect(() => { chart.current?.update({ series }); }, [series]);

  return <div ref={ref} style={{ width: '100%', height: 300 }} />;
}
```

## Структура

```
src/
  chart.js     — TimeSeriesChart: разметка, серии, состояния наведения
  tooltip.js   — общий тултип и алгоритм позиционирования
  scale.js     — расчёт пределов и шага скрытых осей Y
  spline.js    — кривая spline
  styles.js    — CSS компонента (инжектится один раз)
  utils.js     — анимация, цвета, форматирование
  index.d.ts   — типы
demo/main.js   — демо с данными из референса
index.html     — страница демо
test/          — самопроверка в браузере (test/index.html)
```

Лицензия — MIT.
