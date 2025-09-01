import { ChartType } from "../object/chartType.js";
import {renderSimpleBarChart} from "../operations/bar/simple/simpleBarUtil.js";
import {renderStackedBarChart} from "../operations/bar/stacked/stackedBarUtil.js";
import {renderGroupedBarChart} from "../operations/bar/grouped/groupedBarUtil.js";
import {renderSimpleLineChart} from "../operations/line/simple/simpleLineUtil.js";
import {renderMultipleLineChart} from "../operations/line/multiple/multiLineUtil.js";
import {DatumValue} from "../object/valueType.js";
export const dataCache = {};
export const lastCategory = "x";
export const lastMeasure = "y";

export function getChartType(spec) {
  const mark      = spec.mark;
  const encoding  = spec.encoding || {};
  const hasColor  = !!encoding.color;
  const hasFacet  = !!(encoding.column || encoding.row || spec.facet || spec.repeat);

  if (mark === "bar") {
    // 1) facet이 있으면 multiple-bar
    if (hasFacet) {
      return ChartType.MULTIPLE_BAR;
    }

    // 2) color만 쓰인 single-series 수평/수직 바 차트인지 검사
    const isSingleSeriesColor =
      // color 필드가 y축(field)이거나 x축(field)이면서
      encoding.color?.field === encoding.y?.field &&
      encoding.x?.type === "quantitative" &&
      encoding.y?.type === "nominal";

    // color가 없거나, 위 단일 시리즈 색상 맵핑이면 simple-bar
    if (!hasColor || isSingleSeriesColor) {
      return ChartType.SIMPLE_BAR;
    }

    // 3) 그 밖에, stack 속성에 따라 stacked vs. grouped
    const stackType = encoding.y?.stack || encoding.x?.stack || null;
    if (stackType !== "none") {
      return ChartType.STACKED_BAR;
    } else {
      return ChartType.GROUPED_BAR;
    }
  }
  else if (mark === "line" && hasColor) {
    return ChartType.MULTI_LINE;
  }
  else if (mark === "line") {
    return ChartType.SIMPLE_LINE;
  }

  return null;
}

function getHostContainer(chartId) {
  return document.querySelector(`[data-host-for="${chartId}"]`) ||
         document.getElementById(chartId + '__host') ||
         null;
}

function remapIdsForRenderer(chartId) {
  const orig = document.getElementById(chartId);
  if (!orig) return { host: null, canvas: null };
  if (orig.classList && orig.classList.contains('chart-canvas')) {
    const host = getHostContainer(chartId) || orig.parentElement;
    return { host, canvas: orig };
  }

  let host = orig;
  let canvas = host.querySelector(':scope > .chart-canvas');
  if (!canvas) return { host, canvas: null };

  host.setAttribute('data-host-for', chartId);
  host.id = chartId + '__host';
  canvas.id = chartId; // canvas becomes the public target id
  return { host, canvas };
}

function ensureTempTableBelow(chartId, spec) {
  const hostEl = getHostContainer(chartId) || document.getElementById(chartId);
  const chartEl = hostEl; // keep the original variable name below for minimal diffs
  if (!chartEl || !chartEl.parentNode) return;

  let table = chartEl.querySelector(':scope > .temp-chart-table');
  const hadExisting = !!table;
  if (!table) {
    table = document.createElement('div');
    table.className = 'temp-chart-table';
  }

  const renderedWidth = chartEl.getBoundingClientRect ? chartEl.getBoundingClientRect().width : 0;
  const fallbackWidth = (typeof spec?.width === 'number') ? spec.width : 600;
  const targetWidth = Math.round(renderedWidth || fallbackWidth);

  let renderedHeight = 0;
  const canvasEl = document.getElementById(chartId) && document.getElementById(chartId).classList.contains('chart-canvas')
      ? document.getElementById(chartId)
      : chartEl.querySelector(':scope > .chart-canvas');
  const svgEl = (canvasEl && canvasEl.querySelector('svg')) || (document.getElementById(chartId) && document.getElementById(chartId).querySelector('svg')) || chartEl.querySelector('svg');
  if (svgEl && svgEl.getBoundingClientRect) {
    renderedHeight = svgEl.getBoundingClientRect().height || 0;
  } else if (canvasEl && canvasEl.getBoundingClientRect) {
    renderedHeight = canvasEl.getBoundingClientRect().height || 0;
  } else if (chartEl.getBoundingClientRect) {
    renderedHeight = chartEl.getBoundingClientRect().height || 0;
  }
  const fallbackHeight = (typeof spec?.height === 'number') ? spec.height : 300;
  const targetHeight = Math.max(1, Math.round((renderedHeight || fallbackHeight) * 0.2));

  const hostWidth = chartEl.getBoundingClientRect ? Math.round(chartEl.getBoundingClientRect().width) : null;
  const widthFromSvg = svgEl ? Math.round(svgEl.getBoundingClientRect().width) : null;

  table.style.width = `${widthFromSvg || hostWidth || targetWidth}px`;
  table.style.height = `${targetHeight}px`;

  const currentCells = table.querySelectorAll(':scope > .temp-chart-cell').length;
  for (let col = currentCells; col < 5; col++) {
    const cell = document.createElement('div');
    cell.className = 'temp-chart-cell';
    cell.setAttribute('data-row', '0');
    cell.setAttribute('data-col', String(col));
    table.appendChild(cell);
  }

  if (!hadExisting) {
    chartEl.appendChild(table);
  }
}

function ensureChartCanvas(chartId) {
  const container = document.getElementById(chartId) || getHostContainer(chartId);
  if (!container) return null;
  let canvas = container.querySelector(':scope > .chart-canvas');
  if (!canvas) {
    canvas = document.createElement('div');
    canvas.className = 'chart-canvas';
    container.insertBefore(canvas, container.firstChild);
    const directSvg = container.querySelector(':scope > svg');
    if (directSvg) {
      canvas.appendChild(directSvg);
    }
  }
  return canvas;
}

export async function stackChartToTempTable(chartId, vlSpec) {
  const host = getHostContainer(chartId) || document.getElementById(chartId);
  if (!host) return false;

  const canvas = ensureChartCanvas(chartId);
  remapIdsForRenderer(chartId);

  const svg = (document.getElementById(chartId) && document.getElementById(chartId).querySelector('svg')) || (canvas && canvas.querySelector('svg')) || host.querySelector('svg');
  const table = host.querySelector(':scope > .temp-chart-table');
  if (!svg || !table) return false;

  const cells = table.querySelectorAll(':scope > .temp-chart-cell');
  if (!cells || cells.length === 0) return false;

  const limit = Math.min(5, cells.length);
  for (let i = 0; i < limit; i++) {
    const cell = cells[i];
    if (!cell) continue;

    const hasChildElement = Array.from(cell.childNodes).some(n => n.nodeType === 1);
    if (!hasChildElement) {
      const clone = svg.cloneNode(true);

      if (clone.removeAttribute) clone.removeAttribute('id');
      clone.querySelectorAll && clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));

      cell.textContent = '';
      cell.appendChild(clone);

      if (vlSpec) {
        await renderChart(chartId, vlSpec);
      }
      return true;
    }
  }
  return false;
}

function stripAxisTitles(canvas) {
  if (!canvas) return;
  // vega/vega-lite commonly uses these roles/classes for axis titles
  const selectors = [
    '.role-axis-title',
    '.axis-title',
    'text[aria-label*="title"]',
    'text.vega-axis-title',
  ];
  selectors.forEach(sel => {
    canvas.querySelectorAll(sel).forEach(el => {
      // remove only axis titles; keep ticks/labels intact
      try { el.remove(); } catch (_) {}
    });
  });
}

export async function renderChart(chartId, spec) {
    const canvas = ensureChartCanvas(chartId);
    remapIdsForRenderer(chartId);

    // Clear previous chart output to avoid stale axis titles persisting across renders
    if (canvas) {
        while (canvas.firstChild) canvas.removeChild(canvas.firstChild);
    }

    const chartType = await getChartType(spec);
    switch (chartType) {
        case ChartType.SIMPLE_BAR:
            await renderSimpleBarChart(chartId, spec);
            break
        case ChartType.STACKED_BAR:
            await renderStackedBarChart(chartId, spec);
            break;
        case ChartType.GROUPED_BAR:
            await renderGroupedBarChart(chartId, spec);
            break;
        case ChartType.MULTIPLE_BAR:
            await renderGroupedBarChart(chartId, spec);
            break;
        case ChartType.SIMPLE_LINE:
            await renderSimpleLineChart(chartId, spec);
            break;
        case ChartType.MULTI_LINE:
            await renderMultipleLineChart(chartId, spec);
            break;
        default:
            console.warn(`Unknown chartType type: ${chartType}`);
    }
    stripAxisTitles(canvas);
    ensureTempTableBelow(chartId, spec);
}

export function buildSimpleBarSpec(dvList, opts = {}) {
    if (!Array.isArray(dvList) || dvList.length === 0) {
        throw new Error("dvList is empty");
    }

    const {
        orientation = 'vertical',
        width = 600,
        height = 300,
        title
    } = opts;

    // 모든 DatumValue가 동일한 category/measure 이름을 공유한다고 가정
    const categoryField = dvList[0].category; // 예: 'country'
    const measureField  = dvList[0].measure;  // 예: 'rating'

    // Vega-Lite data values: [{ [categoryField]: target, [measureField]: value }, ...]
    const values = dvList.map(d => ({
        [categoryField]: d.target,
        [measureField]: d.value
    }));

    const base = {
        $schema: "https://vega.github.io/schema/vega-lite/v5.json",
        width,
        height,
        data: { values },
        title: title ?? undefined,
        mark: "bar",
        config: {
            axis: { title: null, labels: null, domain: null, ticks: null },
            axisX: { title: null },
            axisY: { title: null }
        }
    };

    if (orientation === 'vertical') {
        return {
            ...base,
            encoding: {
                x: { field: categoryField, type: "nominal", axis: { title: null } },
                y: { field: measureField,  type: "quantitative", axis: { title: null } }
            }
        };
    } else {
        // horizontal: y: category, x: measure
        return {
            ...base,
            encoding: {
                y: { field: categoryField, type: "nominal", axis: { title: null } },
                x: { field: measureField,  type: "quantitative", axis: { title: null } }
            }
        };
    }
}

export function convertToDatumValues(fullData, xField, yField, orientation, group = null) {
    return fullData.map(d => {
        const categoryField = orientation === 'horizontal' ? yField : xField;
        const measureField  = orientation === 'horizontal' ? xField : yField;
        const target        = d[categoryField];
        const value         = d[measureField];
        return new DatumValue(categoryField, measureField, target, group, value);
    });
}

export function addChartOpsText(chartOpsTextId, text = null) {
    if (text != null || text !== undefined) {
        const chartOpsTextDiv = document.getElementById(chartOpsTextId);
        chartOpsTextDiv.innerHTML = text;
    }
}