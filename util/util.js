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

function adjustSvgXAxisLabelClearance(svg, opts = {}) {
  const axisLabel = svg.querySelector('.x-axis-label');
  if (!axisLabel) return true;

  const axisGroup = svg.querySelector('.x-axis');
  if (!axisGroup) return false;

  const tickNodes = axisGroup.querySelectorAll('text');
  if (!tickNodes || tickNodes.length === 0) return false;

  const labelRect = axisLabel.getBoundingClientRect();
  if (!labelRect || !Number.isFinite(labelRect.top)) return false;

  let maxTickBottom = -Infinity;
  tickNodes.forEach(node => {
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect && Number.isFinite(rect.bottom)) {
      maxTickBottom = Math.max(maxTickBottom, rect.bottom);
    }
  });

  if (!Number.isFinite(maxTickBottom)) return false;

  const minGapPx = Number.isFinite(opts.minGap) ? opts.minGap : 12;
  const maxShiftPx = Number.isFinite(opts.maxShift) ? opts.maxShift : 120;
  const overlapPx = (maxTickBottom + minGapPx) - labelRect.top;
  if (overlapPx <= 0) return true;

  const svgRect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
  const currentY = parseFloat(axisLabel.getAttribute('y') || '0');
  if (!Number.isFinite(currentY)) return true;

  const pxDelta = Math.min(overlapPx, maxShiftPx);
  let scaleY = 1;
  if (viewBox && Number.isFinite(viewBox.height) && svgRect && Number.isFinite(svgRect.height) && svgRect.height > 0) {
    scaleY = viewBox.height / svgRect.height;
  }
  axisLabel.setAttribute('y', String(currentY + pxDelta * scaleY));
  return true;
}

function adjustSvgYAxisLabelClearance(svg, opts = {}) {
  const axisLabel = svg.querySelector('.y-axis-label');
  if (!axisLabel) return true;

  const axisGroup = svg.querySelector('.y-axis');
  if (!axisGroup) return false;

  const axisRect = axisGroup.getBoundingClientRect?.();
  const labelRect = axisLabel.getBoundingClientRect?.();
  if (!axisRect || !labelRect || !Number.isFinite(axisRect.left) || !Number.isFinite(labelRect.right)) {
    return false;
  }

  const minGapPx = Number.isFinite(opts.minGap) ? opts.minGap : 12;
  const maxShiftPx = Number.isFinite(opts.maxShift) ? opts.maxShift : 120;
  const desiredRight = axisRect.left - minGapPx;
  const overlapPx = labelRect.right - desiredRight;
  if (overlapPx <= 0) return true;

  const svgRect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
  const currentY = parseFloat(axisLabel.getAttribute('y') || '0');
  if (!Number.isFinite(currentY)) return true;

  const pxDelta = Math.min(overlapPx, maxShiftPx);
  let scaleX = 1;
  if (viewBox && Number.isFinite(viewBox.width) && svgRect && Number.isFinite(svgRect.width) && svgRect.width > 0) {
    scaleX = viewBox.width / svgRect.width;
  }
  axisLabel.setAttribute('y', String(currentY - pxDelta * scaleX));
  return true;
}

export function ensureXAxisLabelClearance(chartId, opts = {}) {
  const attempts = Math.max(1, Math.floor(opts.attempts ?? 3));
  let remaining = attempts;
  const schedule = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => setTimeout(cb, 16);

  const resolveAxisOpts = (axisKey) => {
    const axisOverrides = (opts && typeof opts === 'object' && opts[axisKey] && typeof opts[axisKey] === 'object')
      ? opts[axisKey]
      : null;
    return {
      minGap: axisOverrides?.minGap ?? opts.minGap,
      maxShift: axisOverrides?.maxShift ?? opts.maxShift
    };
  };

  const step = () => {
    if (remaining <= 0) return;
    remaining -= 1;

    schedule(() => {
      const container = document.getElementById(chartId);
      if (!container) {
        if (remaining > 0) step();
        return;
      }
      const svg = container.querySelector('svg');
      if (!svg) {
        if (remaining > 0) step();
        return;
      }
      const handledX = adjustSvgXAxisLabelClearance(svg, resolveAxisOpts('x'));
      const handledY = adjustSvgYAxisLabelClearance(svg, resolveAxisOpts('y'));
      if ((!handledX || !handledY) && remaining > 0) {
        step();
      }
    });
  };

  step();
}

function resolveVegaEmbed() {
  try {
    if (typeof vegaEmbed === 'function') {
      return vegaEmbed;
    }
  } catch (_) {
    // Ignore ReferenceError when vegaEmbed is not defined globally
  }
  const globalObj = typeof window !== 'undefined'
    ? window
    : (typeof globalThis !== 'undefined' ? globalThis : null);
  if (globalObj && typeof globalObj.vegaEmbed === 'function') {
    return globalObj.vegaEmbed.bind(globalObj);
  }
  if (globalObj && globalObj.vega && typeof globalObj.vega.embed === 'function') {
    return (container, spec, options) => globalObj.vega.embed(container, spec, options);
  }
  return null;
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
    ensureXAxisLabelClearance(chartId, { attempts: 5, minGap: 14, maxShift: 140 });
    // ensureTempTableBelow(chartId, spec);
}

export async function renderPlainVegaLiteChart(chartId, spec, options = {}) {
    const canvas = ensureChartCanvas(chartId);
    const { canvas: normalizedCanvas } = remapIdsForRenderer(chartId);
    const target = normalizedCanvas || canvas;

    if (!target) {
        console.warn(`renderPlainVegaLiteChart: unable to resolve canvas for chartId="${chartId}"`);
        return null;
    }

    while (target.firstChild) {
        target.removeChild(target.firstChild);
    }

    if (!spec || typeof spec !== 'object') {
        console.warn('renderPlainVegaLiteChart: expected a Vega-Lite specification object');
        return null;
    }

    const embed = resolveVegaEmbed();
    if (typeof embed !== 'function') {
        console.warn('renderPlainVegaLiteChart: vegaEmbed is not available on the global scope');
        return null;
    }

    // 축 제목을 보존하고 간격을 조정하기 위한 스펙 강화
    const enhancedSpec = {
        ...spec,
        config: {
            ...(spec.config || {}),
            axis: {
                labelFontSize: 10,
                titleFontSize: 12,
                titlePadding: 15,
                labelPadding: 5,
                labelLimit: 0,
                ...(spec.config?.axis || {})
            },
            axisX: {
                labelFontSize: 10,
                titlePadding: 15,
                labelPadding: 5,
                labelLimit: 0,
                ...(spec.config?.axisX || {})
            },
            axisY: {
                labelFontSize: 10,
                titlePadding: 15,
                labelPadding: 5,
                ...(spec.config?.axisY || {})
            }
        }
    };

    // encoding에도 명시적으로 설정
    if (enhancedSpec.encoding) {
        if (enhancedSpec.encoding.x) {
            enhancedSpec.encoding.x.axis = {
                labelFontSize: 10,
                titleFontSize: 12,
                titlePadding: 15,
                labelPadding: 5,
                labelLimit: 0,
                ...(enhancedSpec.encoding.x.axis || {})
            };
        }
        if (enhancedSpec.encoding.y) {
            enhancedSpec.encoding.y.axis = {
                labelFontSize: 10,
                titleFontSize: 12,
                titlePadding: 15,
                labelPadding: 5,
                ...(enhancedSpec.encoding.y.axis || {})
            };
        }
    }

    const embedOptions = {
        actions: false,
        renderer: 'svg',
        padding: { left: 70, right: 30, top: 30, bottom: 70 },
        ...options
    };

    const result = await embed(target, enhancedSpec, embedOptions);
    
    // stripAxisTitles 주석 처리 - 축 제목 유지
    // stripAxisTitles(target);
    
    // 자동으로 라벨 각도 조정
    adjustXAxisLabelAngle(chartId);
    
    ensureXAxisLabelClearance(chartId, { attempts: 5, minGap: 14, maxShift: 140 });
    return result;
}
function adjustXAxisLabelAngle(chartId) {
    // DOM이 렌더링될 때까지 대기
    setTimeout(() => {
        const container = document.getElementById(chartId);
        if (!container) return;
        
        const svg = container.querySelector('svg');
        if (!svg) return;
        
        // x축 라벨들 찾기
        const xAxisLabels = svg.querySelectorAll('.mark-text.role-axis-label[aria-hidden="true"]');
        if (!xAxisLabels || xAxisLabels.length === 0) return;
        
        // 라벨들의 텍스트 길이 분석
        let maxLabelLength = 0;
        let totalOverlap = 0;
        const labels = Array.from(xAxisLabels);
        
        labels.forEach(label => {
            const text = label.textContent || '';
            maxLabelLength = Math.max(maxLabelLength, text.length);
        });
        
        // 라벨 간 겹침 확인
        for (let i = 0; i < labels.length - 1; i++) {
            const rect1 = labels[i].getBoundingClientRect();
            const rect2 = labels[i + 1].getBoundingClientRect();
            if (rect1.right > rect2.left) {
                totalOverlap += (rect1.right - rect2.left);
            }
        }
        
        // 각도 결정 로직
        let targetAngle = 0;
        
        if (totalOverlap > 20 || maxLabelLength > 12) {
            // 심하게 겹치거나 긴 텍스트인 경우
            if (maxLabelLength > 20) {
                targetAngle = -90; // 세로로 눕히기
            } else {
                targetAngle = -45; // 45도 기울이기
            }
        }
        
        // 각도 적용
        if (targetAngle !== 0) {
            labels.forEach(label => {
                const currentTransform = label.getAttribute('transform') || '';
                const match = currentTransform.match(/translate\(([^,]+),([^)]+)\)/);
                
                if (match) {
                    const x = parseFloat(match[1]);
                    const y = parseFloat(match[2]);
                    
                    // 각도에 따른 앵커 조정
                    if (targetAngle === -90) {
                        label.setAttribute('text-anchor', 'end');
                        label.setAttribute('transform', `translate(${x},${y}) rotate(${targetAngle})`);
                    } else {
                        label.setAttribute('text-anchor', 'end');
                        label.setAttribute('transform', `translate(${x},${y}) rotate(${targetAngle})`);
                    }
                }
            });
            
            // 차트 하단 패딩 조정
            const chartRect = svg.getBoundingClientRect();
            const currentHeight = parseFloat(svg.getAttribute('height')) || chartRect.height;
            const additionalPadding = targetAngle === -90 ? 80 : 40;
            svg.setAttribute('height', currentHeight + additionalPadding);
        }
    }, 100);
}


export function buildSimpleBarSpec(dvList, opts = {}) {
    if (!Array.isArray(dvList) || dvList.length === 0) {
        throw new Error("dvList is empty");
    }

    const {
        orientation = 'vertical',
        width = 600,
        height = 300,
        title,
        axisLabels = null
    } = opts;

    // 모든 DatumValue가 동일한 category/measure 이름을 공유한다고 가정
    const categoryField = dvList[0].category; // 예: 'country'
    const measureField  = dvList[0].measure;  // 예: 'rating'

    // Vega-Lite data values: [{ [categoryField]: target, [measureField]: value }, ...]
    const values = dvList.map(d => ({
        [categoryField]: d.target,
        [measureField]: d.value,
        id: d.id ?? null,
        group: d.group ?? null
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

    const spec = (orientation === 'vertical')
        ? {
            ...base,
            encoding: {
                x: { field: categoryField, type: "nominal", axis: { title: null } },
                y: { field: measureField,  type: "quantitative", axis: { title: null } }
            }
        }
        : {
            ...base,
            encoding: {
                y: { field: categoryField, type: "nominal", axis: { title: null } },
                x: { field: measureField,  type: "quantitative", axis: { title: null } }
            }
        };

    if (axisLabels && (Object.prototype.hasOwnProperty.call(axisLabels, 'x') || Object.prototype.hasOwnProperty.call(axisLabels, 'y'))) {
        spec.meta = {
            ...(spec.meta || {}),
            axisLabels: { ...axisLabels }
        };
    }

    return spec;
}

export function convertToDatumValues(fullData, xField, yField, orientation, fallbackGroup = null) {
    const rows = Array.isArray(fullData) ? fullData : [];
    const isHorizontal = orientation === 'horizontal';
    const categoryField = isHorizontal ? (yField || 'category') : (xField || 'category');
    const measureField = isHorizontal ? (xField || 'value') : (yField || 'value');

    return rows.map((row = {}, idx) => {
        const baseCategory = row.category || categoryField;
        const baseMeasure = row.measure || measureField;

        if (row instanceof DatumValue) {
            const resolvedCloneId = row.id ?? row.lookupId ?? row.target ?? `${baseCategory}_${idx}`;
            const cloneId = resolvedCloneId != null ? String(resolvedCloneId) : `${baseCategory}_${idx}`;
            const cloned = new DatumValue(
                baseCategory,
                baseMeasure,
                row.target,
                row.group ?? fallbackGroup ?? null,
                row.value,
                cloneId
            );
            if (row.lookupId != null) {
                cloned.lookupId = String(row.lookupId);
            } else {
                cloned.lookupId = cloneId;
            }
            return cloned;
        }

        const targetRaw = (row?.[categoryField] ?? row?.target ?? row?.category ?? idx);
        const target = targetRaw != null ? String(targetRaw) : `item_${idx}`;

        const rawValue = row?.[measureField] ?? row?.value;
        const numericValue = Number(rawValue);
        const value = Number.isFinite(numericValue) ? numericValue : rawValue;

        const groupValue = row?.group ?? fallbackGroup ?? null;
        const stableIdRaw = row?.id ?? row?.lookupId ?? null;
        const stableId = stableIdRaw != null ? String(stableIdRaw) : undefined;

        const datum = new DatumValue(
            baseCategory,
            baseMeasure,
            target,
            groupValue,
            value,
            stableId
        );

        const lookupIdRaw = row?.lookupId ?? stableId ?? target;
        if (lookupIdRaw != null) {
            datum.lookupId = String(lookupIdRaw);
        }
        if (row?.tooltip != null) {
            datum.tooltip = row.tooltip;
        }
        return datum;
    });
}

export function addChartOpsText(chartOpsTextId, text = null) {
    if (text != null || text !== undefined) {
        const chartOpsTextDiv = document.getElementById(chartOpsTextId);
        chartOpsTextDiv.innerHTML = text;
    }
}
