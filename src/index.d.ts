export type SeriesType = 'area' | 'spline' | 'line' | 'bar';

/** A single data item: plain value (x = index / categories[i]), [x, y] pair or {x, y} object. */
export type DataPoint =
  | number
  | null
  | [x: Date | number | string, y: number | null]
  | { x: Date | number | string; y: number | null };

export interface MarkerOptions {
  /** Draw markers on every point (default: true for `line`, false for `area`/`spline` — they show on hover only). */
  enabled?: boolean;
  symbol?: 'circle' | 'square';
  /** Marker radius in px (default 3). */
  radius?: number;
  fillColor?: string;
  lineColor?: string;
  lineWidth?: number;
}

export interface SeriesOptions {
  type: SeriesType;
  name?: string;
  /** Series colour; defaults to `colors[index]`. */
  color?: string;
  data: DataPoint[];
  /**
   * Key of the (hidden) y-axis the series is plotted on. Every series gets its own
   * axis by default; give two series the same key to plot them on one scale.
   */
  yAxis?: string | number;
  /** Decimals used in the tooltip. Undefined → as many as the value has. */
  valueDecimals?: number;
  valuePrefix?: string;
  valueSuffix?: string;
  /** Line width (area 1, spline 3, line 1). */
  lineWidth?: number;
  /** SVG dash array, e.g. "4 2". */
  dashStyle?: string;
  /** Area fill colour / opacity (default: series colour at 0.5). */
  fillColor?: string;
  fillOpacity?: number;
  marker?: MarkerOptions;
  /** Bars: border and geometry. */
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  pointPadding?: number;
  groupPadding?: number;
  pointWidth?: number;
  minPointLength?: number;
  /** Per-series hover overrides. */
  states?: { hover?: { lineWidth?: number } };
}

export interface TooltipPoint {
  series: unknown;
  name: string;
  color: string;
  y: number;
  /** Value formatted with valueDecimals / prefix / suffix. */
  formatted: string;
}

export interface TooltipContext {
  /** Category label (formatted x). */
  category: string;
  index: number;
  points: TooltipPoint[];
  anchorX: number;
  anchorY: number;
  negative: boolean;
}

export interface TooltipOptions {
  enabled?: boolean;
  /** Distance from the hovered x to the box (default 16). */
  distance?: number;
  /** Delay before the tooltip fades out after the pointer leaves (default 500 ms). */
  hideDelay?: number;
  /** Animate box movement (default true). */
  animation?: boolean;
  /** Full custom HTML for the box. */
  formatter?: (ctx: TooltipContext) => string;
  /** Custom HTML for the header line. */
  headerFormatter?: (ctx: TooltipContext) => string;
  /** Custom HTML for one series row. */
  pointFormatter?: (point: TooltipPoint, ctx: TooltipContext) => string;
  decimalPoint?: string;
  thousandsSep?: string;
}

export interface YAxisDefaults {
  /** Align tick counts between axes (default true) — affects how the axis max is rounded. */
  alignTicks?: boolean;
  tickPixelInterval?: number;
  tickAmount?: number;
  minPadding?: number;
  maxPadding?: number;
}

export interface YAxisOptions {
  min?: number | null;
  max?: number | null;
  tickAmount?: number;
  minPadding?: number;
  maxPadding?: number;
}

export interface ChartOptions {
  /** Fixed size; defaults to the container size (kept in sync with ResizeObserver). */
  width?: number;
  height?: number;
  /** Padding around the plot area: number or [top, right, bottom, left]. Default 0. */
  spacing?: number | [number, number, number, number];
  backgroundColor?: string;
  plotBackgroundColor?: string;
  plotBorderWidth?: number;
  plotBorderColor?: string;
  plotBorderRadius?: number;
  /** Initial reveal animation (default { duration: 1000 }); false to disable. */
  animation?: false | { duration?: number };
  /** Palette used when a series has no `color`. */
  colors?: string[];
  /** Explicit x categories; when omitted they are derived from the data x values. */
  categories?: Array<string | number | Date>;
  /** Date format for x labels ("dd.mm.yyyy") or a custom function. */
  xFormat?: string | ((x: unknown) => string);
  yAxis?: YAxisDefaults;
  /** Per-axis overrides keyed by `series.yAxis`. */
  yAxes?: Record<string | number, YAxisOptions>;
  tooltip?: TooltipOptions;
  states?: {
    hover?: {
      /** Line width of the hovered series (default 1). */
      lineWidth?: number;
      halo?: { size?: number; opacity?: number };
      marker?: { radiusPlus?: number; lineWidthPlus?: number; lineColor?: string };
      /** Bar brightness change on hover (default 0.1). */
      brightness?: number;
    };
    inactive?: { opacity?: number };
  };
  series: SeriesOptions[];
}

export class TimeSeriesChart {
  constructor(container: HTMLElement | string, options: ChartOptions);
  readonly container: HTMLElement;
  readonly options: ChartOptions;
  /** Merge options and redraw. */
  update(options: Partial<ChartOptions>, animate?: boolean): void;
  /** Replace the data of every series (same order as `options.series`). */
  setData(data: DataPoint[][], animate?: boolean): void;
  setSize(width: number, height: number): void;
  reflow(): void;
  destroy(): void;
}

export const DEFAULT_OPTIONS: ChartOptions;
export const DEFAULT_COLORS: string[];
export const TYPE_DEFAULTS: Record<SeriesType, Partial<SeriesOptions>>;

export function computeAxis(
  dataMin: number,
  dataMax: number,
  opts: { plotHeight: number; tickPixelInterval?: number; minPadding?: number; maxPadding?: number; alignTicks?: boolean; tickAmount?: number; min?: number | null; max?: number | null },
): { min: number; max: number; tickInterval: number; tickPositions: number[] };
export function normalizeTickInterval(interval: number, hasTickAmount: boolean): number;
export function splinePath(points: Array<{ x: number; y: number } | null>): string;
export function formatNumber(value: number, decimals?: number, decimalPoint?: string, thousandsSep?: string): string;
export function formatDate(date: Date | number, format?: string): string;
