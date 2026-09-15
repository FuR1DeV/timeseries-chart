/**
 * Component styles, injected once into <head>.
 * Everything is scoped under `.tsc-` class names.
 */

const STYLE_ID = 'tsc-chart-styles';

export const CSS = `
.tsc-container {
  position: relative;
  overflow: hidden;
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-size: 12px;
  line-height: normal;
  -webkit-tap-highlight-color: transparent;
  -webkit-user-select: none;
  user-select: none;
  touch-action: pan-y;
}
.tsc-inner {
  position: relative;
}
.tsc-inner > svg {
  display: block;
  overflow: visible;
}
.tsc-series {
  transition: opacity 50ms linear;
}
.tsc-series.tsc-inactive {
  opacity: 0.2;
}
.tsc-graph {
  fill: none;
  stroke-linejoin: round;
  stroke-linecap: round;
  transition: stroke-width 500ms cubic-bezier(0.445, 0.05, 0.55, 0.95);
}
.tsc-series.tsc-hover .tsc-graph {
  transition-duration: 150ms;
}
.tsc-bar {
  transition: fill 50ms linear;
}
.tsc-tooltip {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 3;
  box-sizing: border-box;
  pointer-events: none;
  background: #ffffff;
  border-radius: 3px;
  padding: 8px;
  color: #333333;
  white-space: nowrap;
  line-height: 15px;
  filter: drop-shadow(1px 1px 2.5px rgba(0, 0, 0, 0.75));
  opacity: 0;
  visibility: hidden;
  transition: opacity 150ms linear, visibility 0s linear 150ms;
}
.tsc-tooltip.tsc-visible {
  opacity: 1;
  visibility: visible;
  transition: opacity 0s linear, visibility 0s linear;
}
.tsc-tooltip.tsc-animate {
  transition-property: left, top;
  transition-duration: 300ms;
  transition-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
}
.tsc-tooltip-header {
  font-size: 0.8em;
  line-height: 12.6px;
}
.tsc-tooltip-point b {
  font-weight: bold;
}
`;

let injected = false;

/** Inject the stylesheet once (no-op on the server). */
export function injectStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
