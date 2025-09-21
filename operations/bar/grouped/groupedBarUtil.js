import {OperationType} from "../../../object/operationType.js";
import {dataCache, lastCategory, lastMeasure, stackChartToTempTable} from "../../../util/util.js";
import {
    clearAllAnnotations,
    delay,
    groupedBarAverage,
    groupedBarCompare, groupedBarCount,
    groupedBarDetermineRange, groupedBarDiff,
    groupedBarFilter,
    groupedBarFindExtremum, groupedBarNth,
    groupedBarRetrieveValue, groupedBarSort, groupedBarSum
} from "./groupedBarFunctions.js";
import { DatumValue } from "../../../object/valueType.js";

const GROUPED_BAR_OP_HANDLES = {
    [OperationType.RETRIEVE_VALUE]: groupedBarRetrieveValue,
    [OperationType.FILTER]:         groupedBarFilter,
    [OperationType.FIND_EXTREMUM]:  groupedBarFindExtremum,
    [OperationType.DETERMINE_RANGE]:groupedBarDetermineRange,
    [OperationType.COMPARE]:        groupedBarCompare,
    [OperationType.SORT]:           groupedBarSort,
    [OperationType.SUM]:            groupedBarSum,
    [OperationType.AVERAGE]:        groupedBarAverage,
    [OperationType.DIFF]:           groupedBarDiff,
    [OperationType.NTH]:            groupedBarNth,
    [OperationType.COUNT]:          groupedBarCount,
}

const chartDataStore = {};

async function applyGroupedBarOperation(chartId, operation, currentData, isLast = false)  {
    const fn = GROUPED_BAR_OP_HANDLES[operation.op];
    if (!fn) {
        console.warn(`Unsupported operation: ${operation.op}`);
        return currentData;
    }
    return await fn(chartId, operation, currentData, isLast);
}

async function executeGroupedBarOpsList(chartId, opsList, currentData, isLast = false, delayMs = 0)  {
    for (let i = 0; i < opsList.length; i++) {
        const operation = opsList[i];
        currentData = await applyGroupedBarOperation(chartId, operation, currentData, isLast);

        if (delayMs > 0) {
            await delay(delayMs);
        }
    }
    return currentData;
}

/**
 * 네비게이션 버튼 UI 생성 (SVG 내부에 배치)
 */
function createNavigationControls(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    
    if (svg.empty()) {
        console.error("createNavigationControls: SVG not found for chartId:", chartId);
        return { nextButton: null, stepIndicator: null };
    }
    
    // 차트의 마진 정보 가져오기
    const marginLeft = +svg.attr("data-m-left") || 80;
    
    // 기존 네비게이션 그룹 제거
    svg.select(".nav-controls-group").remove();
    
    // *** 수정된 부분 1: 내비게이션 UI의 Y 위치를 고정값으로 설정하여 차트 상단 여백에 배치합니다. ***
    const navGroup = svg.append("g")
        .attr("class", "nav-controls-group")
        .attr("transform", `translate(${marginLeft}, 30)`);

    // 배경 박스
    const bgRect = navGroup.append("rect")
        .attr("class", "nav-bg")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", 130)
        .attr("height", 35)
        .attr("rx", 5)
        .attr("ry", 5)
        .attr("fill", "rgba(255, 255, 255, 0.9)")
        .attr("stroke", "#ccc")
        .attr("stroke-width", 1);

    // 다음 버튼
    const nextButton = navGroup.append("g")
        .attr("class", "nav-btn next-btn")
        .attr("transform", "translate(5, 5)")
        .style("cursor", "pointer");

    nextButton.append("rect")
        .attr("width", 60)
        .attr("height", 25)
        .attr("rx", 3)
        .attr("fill", "#007bff")
        .attr("stroke", "#0056b3")
        .attr("stroke-width", 1);

    nextButton.append("text")
        .attr("x", 30)
        .attr("y", 17)
        .attr("text-anchor", "middle")
        .attr("fill", "white")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .text("Next →");

    // 단계 표시기
    const stepIndicator = navGroup.append("text")
        .attr("class", "step-indicator")
        .attr("x", 95)
        .attr("y", 22)
        .attr("text-anchor", "middle")
        .attr("fill", "#333")
        .attr("font-size", "12px")
        .attr("font-weight", "bold");

    console.log("Navigation controls created successfully for:", chartId, "at position:", `${marginLeft}, 30`);
    
    return { nextButton, stepIndicator };
}

/**
 * 버튼 상태 업데이트
 */
function updateButtonStates(nextButton, stepIndicator, currentStep, totalSteps) {
    if (!nextButton || !stepIndicator) return;
    
    // 다음 버튼 상태
    if (currentStep === totalSteps - 1) {
        nextButton.select("rect").attr("fill", "#6c757d").attr("opacity", 0.5);
        nextButton.select("text").text("Done");
        nextButton.style("cursor", "not-allowed");
    } else {
        nextButton.select("rect").attr("fill", "#007bff").attr("opacity", 1);
        nextButton.select("text").text("Next →");
        nextButton.style("cursor", "pointer");
    }

    // 단계 표시기 업데이트
    stepIndicator.text(`${currentStep + 1}/${totalSteps}`);
}

/**
 * 차트 리셋
 */
async function fullChartReset(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    if (svg.empty()) return;
    
    clearAllAnnotations(svg);
    
    // 모든 막대를 기본 상태로 리셋
    const resetPromises = [];
    svg.selectAll("rect[data-id]").each(function() {
        const rect = d3.select(this);
        const t = rect.transition().duration(400)
            .attr("opacity", 1)
            .attr("stroke", "none")
            .end();
        resetPromises.push(t);
    });
    await Promise.all(resetPromises);
}

export async function runGroupedBarOps(chartId, vlSpec, opsSpec) {
    const svg = d3.select(`#${chartId}`).select("svg");
    const chartInfo = chartDataStore[chartId];

    if (!chartInfo || !chartInfo.spec) {
        console.error("Chart info/spec not found. Please render the chart first via renderGroupedBarChart(...).");
        return;
    }

    if (svg.empty() || svg.select(".plot-area").empty()) {
        await renderGroupedBarChart(chartId, chartInfo.spec);
    }

    const fullData = chartInfo.data;
    const { rows, datumValues, categoryLabel, measureLabel } = toGroupedDatumValues(fullData, vlSpec);

    const keys = Object.keys(opsSpec);
    if (keys.length === 0) return;

    let currentStep = 0;
    const totalSteps = keys.length;
    const zeroDelay = 0;

    // 네비게이션 컨트롤 생성
    const controls = createNavigationControls(chartId);
    
    if (!controls.nextButton || !controls.stepIndicator) {
        console.error("Failed to create navigation controls");
        return;
    }
    
    const { nextButton, stepIndicator } = controls;

    // dataCache 초기화
    Object.keys(dataCache).forEach(key => delete dataCache[key]);

    // 각 스텝을 실행하는 공통 루틴
    const runStep = async (stepIndex) => {
        const opKey = keys[stepIndex];
        
        // 차트 리셋
        await fullChartReset(chartId);

        console.log('before op:', opKey, datumValues);
        const opsList = opsSpec[opKey];
        
        let currentData = datumValues.slice(); // 베이스 복사
        currentData = await executeGroupedBarOpsList(chartId, opsList, currentData, false, zeroDelay);
        
        const currentDataArray = Array.isArray(currentData)
            ? currentData
            : (currentData != null ? [currentData] : []);

        currentDataArray.forEach((datum, idx) => {
            if (datum instanceof DatumValue) {
                datum.id = `${opKey}_${idx}`;
                datum.category = lastCategory ?? categoryLabel;
                datum.measure = lastMeasure ?? measureLabel;
            }
        });

        dataCache[opKey] = currentDataArray;
        console.log('after op:', opKey, currentData);
    };

    // 버튼 이벤트 핸들러
    const updateStep = async (newStep) => {
        if (newStep < 0 || newStep >= totalSteps) return;
        
        currentStep = newStep;
        await runStep(currentStep);
        updateButtonStates(nextButton, stepIndicator, currentStep, totalSteps);
    };

    // 이벤트 리스너 등록 (한 번만)
    nextButton.on("click", () => {
        if (currentStep < totalSteps - 1) {
            updateStep(currentStep + 1);
        }
    });

    // 초기: 첫 번째 키 실행
    await runStep(0);
    updateButtonStates(nextButton, stepIndicator, currentStep, totalSteps);
}

export async function renderGroupedBarChart(chartId, spec) {
  const container = d3.select(`#${chartId}`);
  container.selectAll("*").remove();

  // *** 수정된 부분 2: 상단 여백(margin.top)을 줄여 불필요한 공간을 제거하고 레이아웃을 개선합니다. ***
  const margin = { top: 80, right: 120, bottom: 60, left: 80 };
  const width = 900 - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const { column, x, y, color } = spec.encoding;
  const facetField = column.field;
  const xField = x.field;
  const yField = y.field;
  const colorField = color.field;

  const rawData = await d3.csv(spec.data.url, d => {
    d[yField] = +d[yField];
    return d;
  });

  chartDataStore[chartId] = { data: rawData, spec: spec };
  const data = rawData;

  const svg = container.append("svg")
    .attr("viewBox", [0, 0, width + margin.left + margin.right, height + margin.top + margin.bottom])
    .attr("data-x-field", xField)
    .attr("data-y-field", yField)
    .attr("data-facet-field", facetField)
    .attr("data-color-field", colorField)
    .attr("data-m-left", margin.left)
    .attr("data-m-top", margin.top)
    .attr("data-plot-w", width)
    .attr("data-plot-h", height);

  const g = svg.append("g")
    .attr("class", "plot-area")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const facets = Array.from(new Set(data.map(d => d[facetField])));
  const xDomain = Array.from(new Set(data.map(d => d[xField])));

  const x0 = d3.scaleBand().domain(facets).range([0, width]).paddingInner(0.2);
  const x1 = d3.scaleBand().domain(xDomain).range([0, x0.bandwidth()]).padding(0.05);
  const yMax = d3.max(data, d => d[yField]);
  const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([height, 0]);

  const defaultPalette = ["#0072B2", "#E69F00"];
  const palette = (spec.encoding?.color?.scale?.range) ?? defaultPalette;
  const colorScale = d3.scaleOrdinal(palette).domain(xDomain);

  facets.forEach(facetValue => {
    const facetGroup = g.append("g")
      .attr("class", `facet-group-${facetValue}`)
      .attr("transform", `translate(${x0(facetValue)},0)`);

    const facetData = data.filter(d => d[facetField] === facetValue);

    facetGroup.selectAll("rect")
      .data(facetData)
      .join("rect")
      .attr("x", d => x1(d[xField]))
      .attr("y", d => yScale(d[yField]))
      .attr("width", x1.bandwidth())
      .attr("height", d => height - yScale(d[yField]))
      .attr("fill", d => colorScale(d[colorField]))
      .datum(d => ({
        facet: d[facetField],
        key: d[xField],
        value: d[yField]
      }))
      .attr("data-id", d => `${d.facet}-${d.key}`)
      .attr("data-value", d => d.value);
  });

  g.append("g")
    .attr("class", "x-axis-bottom-line")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x0).tickSizeOuter(0).tickPadding(6));

  g.append("g").attr("class", "y-axis")
    .call(d3.axisLeft(yScale));

  const legend = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${width + margin.left + 20},${margin.top})`);

  xDomain.forEach((value, i) => {
    const legendRow = legend.append("g").attr("transform", `translate(0, ${i * 20})`);
    legendRow.append("rect")
      .attr("width", 15).attr("height", 15)
      .attr("fill", colorScale(value));
    legendRow.append("text")
      .attr("x", 20).attr("y", 12.5)
      .text(value);
  });
}

export function toGroupedDatumValues(rawData, spec) {
  const enc = spec?.encoding || {};
  const xEnc = enc.x || {};
  const yEnc = enc.y || {};
  const colorEnc = enc.color || {};
  const colEnc = enc.column || {};
  const rowEnc = enc.row || {};

  const facetField = colEnc.field || rowEnc.field || null;
  if (!facetField) {
    console.warn('toGroupedDatumValues: facet (column/row) field not found; falling back to raw x as category');
  }

  const xField = xEnc.field || null;
  const yField = yEnc.field || null;
  const colorField = colorEnc.field || null;
  const xType = xEnc.type;
  const yType = yEnc.type;
  const xAgg = xEnc.aggregate || null;
  const yAgg = yEnc.aggregate || null;

  const isXQuant = xType === 'quantitative';
  const valueField = isXQuant ? xField : yField;
  const numericEnc = isXQuant ? xEnc : yEnc;
  const measureLabel = (numericEnc.axis && numericEnc.axis.title) || (numericEnc.aggregate || numericEnc.field || 'value');

  const facetLabel = (colEnc.axis && colEnc.axis.title) || (rowEnc.axis && rowEnc.axis.title) || (facetField || 'category');

  let subgroupField = colorField || (isXQuant ? null : xField);
  if (!subgroupField) subgroupField = colorField || xField || null;

  const toNum = v => { const n = +v; return Number.isFinite(n) ? n : 0; };

  const facets = facetField ? Array.from(new Set(rawData.map(d => d[facetField]))) : [null];
  const subgroups = subgroupField ? Array.from(new Set(rawData.map(d => d[subgroupField]))) : [null];

  function aggregateFor(facetVal, subgroupVal) {
    const rows = rawData.filter(r =>
      (facetField ? r[facetField] === facetVal : true) &&
      (subgroupField ? r[subgroupField] === subgroupVal : true)
    );

    if (yAgg === 'count' || xAgg === 'count' || !valueField) return rows.length;

    const vals = valueField ? rows.map(r => toNum(r[valueField])) : [];
    if (xAgg === 'mean' || yAgg === 'mean') return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
    if (xAgg === 'min'  || yAgg === 'min')  return vals.length ? Math.min(...vals) : 0;
    if (xAgg === 'max'  || yAgg === 'max')  return vals.length ? Math.max(...vals) : 0;
    return vals.reduce((a,b)=>a+b,0);
  }

  const rows = [];
  const datumValues = [];

  subgroups.forEach(sg => {
    facets.forEach(fv => {
      const v = aggregateFor(fv, sg);
      const row = { [facetLabel]: fv, [measureLabel]: v, group: sg };
      rows.push(row);
      datumValues.push(new DatumValue(facetField || 'category', measureLabel, fv, sg, v, undefined));
    });
  });

  return { rows, datumValues, categoryLabel: facetLabel, measureLabel };
}