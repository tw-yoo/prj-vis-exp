import { DatumValue } from "../../../object/valueType.js";
import {
    simpleLineCompare,
    simpleLineDetermineRange,
    simpleLineFilter,
    simpleLineFindExtremum,
    simpleLineRetrieveValue,
    clearAllAnnotations as simpleClearAllAnnotations,
    delay, simpleLineSum, simpleLineAverage, simpleLineDiff, simpleLineCount
} from '../simple/simpleLineFunctions.js';

import {
    multipleLineRetrieveValue, multipleLineFilter, multipleLineFindExtremum,
    multipleLineDetermineRange, multipleLineCompare, multipleLineAverage, multipleLineDiff,
    multipleLineCount, multipleLineNth, multipleLineCompareBool
} from './multiLineFunctions.js';
import {OperationType} from "../../../object/operationType.js";
import {dataCache, lastCategory, lastMeasure, stackChartToTempTable} from "../../../util/util.js";

export const chartDataStore = {};

const MULTIPLE_LINE_OP_HANDLERS = {
    [OperationType.RETRIEVE_VALUE]: multipleLineRetrieveValue,
    [OperationType.FILTER]:         multipleLineFilter,
    [OperationType.FIND_EXTREMUM]:  multipleLineFindExtremum,
    [OperationType.DETERMINE_RANGE]:multipleLineDetermineRange,
    [OperationType.COMPARE]:        multipleLineCompare,
    [OperationType.COMPARE_BOOL]:   multipleLineCompareBool,
    //[OperationType.SUM]:            multipleLineSum,
    [OperationType.AVERAGE]:        multipleLineAverage,
    [OperationType.DIFF]:           multipleLineDiff,
    [OperationType.NTH]:            multipleLineNth,
    [OperationType.COUNT]:          multipleLineCount,
};


async function applyMultipleLineOperation(chartId, operation, currentData) {
    const fn = MULTIPLE_LINE_OP_HANDLERS[operation.op];
    if (!fn) {
        console.warn(`Unsupported operation: ${operation.op}`);
        return currentData;
    }
    return await fn(chartId, operation, currentData);
}

async function executeMultipleLineOpsList(chartId, opsList, currentData, delayMs = 0) {
    for (let i = 0; i < opsList.length; i++) {
        const operation = opsList[i];
        currentData = await applyMultipleLineOperation(chartId, operation, currentData);
        
        if (delayMs > 0) {
            await delay(delayMs);
        }
    }
    return currentData;
}

async function fullChartReset(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    if (svg.empty()) return;

    const g = svg.select(".plot-area");
    const chartInfo = chartDataStore[chartId];
    if (!chartInfo) return;

    const { colorScale } = chartInfo;

    simpleClearAllAnnotations(svg);

    const resetPromises = [];

    // [수정] 점들을 삭제하는 대신, 투명하게 만들어 다음을 위해 남겨둡니다.
    resetPromises.push(
        g.selectAll("circle.datapoint")
            .transition().duration(400)
            .attr("opacity", 0)
            .end()
    );

    resetPromises.push(
        g.selectAll("path.series-line")
            .transition().duration(400)
            .attr("opacity", 1)
            .attr("stroke-width", 2)
            .attr("stroke", d => colorScale(d.key))
            .end()
    );

    resetPromises.push(
        g.select(".legend")
            .transition().duration(400)
            .attr("opacity", 1)
            .end()
    );

    await Promise.all(resetPromises).catch(err => {});
}

/**
 * 네비게이션 버튼 UI 생성 (SVG 내부에 배치)
 */
function createNavigationControls(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    
    // 기존 네비게이션 그룹 제거
    svg.select(".nav-controls-group").remove();
    
    // 네비게이션 그룹 생성 (SVG 내부, 좌상단)
    const navGroup = svg.append("g")
        .attr("class", "nav-controls-group")
        .attr("transform", "translate(15, 15)");

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

    return { nextButton, stepIndicator };
}

/**
 * 버튼 상태 업데이트
 */
function updateButtonStates(nextButton, stepIndicator, currentStep, totalSteps) {
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

export async function runMultipleLineOps(chartId, vlSpec, opsSpec) {
    const chartInfo = chartDataStore[chartId];
    if (!chartInfo) {
        console.error(`runMultipleLineOps: No data in store for chartId '${chartId}'.`);
        return;
    }
    
    let fullData = [...chartInfo.data];
    const { rows, datumValues, categoryLabel, measureLabel } =
        multipleLineToDatumValues(fullData, vlSpec);

    const keys = Object.keys(opsSpec);
    if (keys.length === 0) return;

    let currentStep = 0;
    const totalSteps = keys.length;
    const zeroDelay = 0; // 애니메이션 딜레이 제거

    // 네비게이션 컨트롤 생성 (한 번만)
    const { nextButton, stepIndicator } = createNavigationControls(chartId);

    // 각 스텝을 실행하는 공통 루틴
    const runStep = async (stepIndex) => {
        const opKey = keys[stepIndex];
        
        // 차트 리셋
        await fullChartReset(chartId);

        // ops 실행
        const opsList = opsSpec[opKey] || [];
        let currentData = datumValues.slice(); // 베이스 복사
        currentData = await executeMultipleLineOpsList(chartId, opsList, currentData, zeroDelay);

        // 캐시 저장
        const currentDataArray = Array.isArray(currentData)
            ? currentData
            : (currentData != null ? [currentData] : []);

        currentDataArray.forEach((datum, idx) => {
            if (datum && typeof datum === "object") {
                datum.id = `${opKey}_${idx}`;
                datum.category = lastCategory ?? categoryLabel;
                datum.measure = lastMeasure ?? measureLabel;
            }
        });

        dataCache[opKey] = currentDataArray;
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

    // 마지막에 dataCache 정리는 하지 않음 (데이터 손상 방지)
}


export async function renderMultipleLineChart(chartId, spec) {
    const container = d3.select(`#${chartId}`);
    container.selectAll("*").remove();

    const margin = { top: 60, right: 120, bottom: 50, left: 60 }; // top 마진 증가
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const xField = spec.encoding.x.field;
    const yField = spec.encoding.y.field;
    const colorField = spec.encoding.color.field;
    const isTemporal = spec.encoding.x.type === 'temporal';

    const data = await d3.csv(spec.data.url, d => {
        // Keep xField as raw text even if it looks like a date; convert only at render time.
        d[xField] = String(d[xField]);
        d[yField] = +d[yField];
        return d;
    });

    const series = d3.groups(data, d => d[colorField]).map(([key, values]) => ({ key, values }));

    // xScale
    let xScale;
    if (isTemporal) {
        xScale = d3.scaleTime()
            .domain(d3.extent(data, d => new Date(d[xField])))
            .range([0, width]);
    } else {
        // Non-temporal: use unique ordered domain for scalePoint
        const seen = new Set();
        const domain = [];
        for (const d of data) {
            const k = String(d[xField]);
            if (!seen.has(k)) { seen.add(k); domain.push(k); }
        }
        xScale = d3.scalePoint()
            .domain(domain)
            .range([0, width]);
    }

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d[yField])]).nice()
        .range([height, 0]);

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10)
        .domain(series.map(s => s.key));

    chartDataStore[chartId] = {
        data,
        series,
        fullXScale: xScale,
        fullYScale: yScale,
        colorScale
    };

    const svg = container.append("svg")
        .attr("viewBox", [0, 0, width + margin.left + margin.right, height + margin.top + margin.bottom])
        .attr("data-x-field", xField)
        .attr("data-y-field", yField)
        .attr("data-color-field", colorField)
        .attr("data-m-left", margin.left)
        .attr("data-m-top", margin.top)
        .attr("data-plot-w", width)
        .attr("data-plot-h", height);

    const g = svg.append("g")
        .attr("class", "plot-area")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale));

    g.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(yScale));

    const lineGen = d3.line()
        .x(d => isTemporal ? xScale(new Date(d[xField])) : xScale(d[xField]))
        .y(d => yScale(d[yField]));

    // Draw series lines
    g.selectAll(".series-line")
        .data(series, d => d.key)
        .join("path")
        .attr("class", d => `series-line series-${String(d.key).replace(/\s+/g, '-')}`)
        .attr("fill", "none")
        .attr("stroke", d => colorScale(d.key))
        .attr("stroke-width", 2)
        .attr("d", d => lineGen(d.values));

    // Draw datapoint circles for all series
    g.selectAll("circle.datapoint")
        .data(
            data,
            d => {
                const kx = String(d[xField]);
                const ks = String(d[colorField]);
                return `${kx}|${ks}`; // stable key per (x, series)
            }
        )
        .join(
            enter => enter.append("circle")
                .attr("class", "datapoint")
                .attr("cx", d => isTemporal ? xScale(new Date(d[xField])) : xScale(d[xField]))
                .attr("cy", d => yScale(d[yField]))
                .attr("r", 3.5)
                .attr("fill", d => colorScale(d[colorField]))
                .attr("opacity", 0)
                .attr("data-id", d => String(d[xField]))
                .attr("data-value", d => d[yField])
                .attr("data-series", d => String(d[colorField]))
        );

    // Simple legend
    const legend = g.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${width + 20}, 0)`);

    series.forEach((s, i) => {
        const legendRow = legend.append("g").attr("transform", `translate(0, ${i * 20})`);
        legendRow.append("rect").attr("width", 15).attr("height", 15).attr("fill", colorScale(s.key));
        legendRow.append("text").attr("x", 20).attr("y", 12).text(s.key).style("font-size", "12px");
    });
}

function multipleLineToDatumValues(rawData, spec) {
  const xEnc = spec.encoding.x || {};
  const yEnc = spec.encoding.y || {};
  const colorEnc = spec.encoding.color || {};

  const xField = xEnc.field;
  const yField = yEnc.field;
  const colorField = colorEnc.field;

  const categoryLabel = (xEnc.axis && xEnc.axis.title) || xField || 'x';
  const measureLabel = (yEnc.axis && yEnc.axis.title) || yField || 'y';

  const rows = [];
  const datumValues = [];

  rawData.forEach(d => {
    const categoryVal = String(d[xField]);
    const measureVal = +d[yField];
    const groupVal = colorField ? d[colorField] : null;

    rows.push({
      [categoryLabel]: categoryVal,
      [measureLabel]: measureVal,
      group: groupVal
    });

    datumValues.push(new DatumValue(
      xField,
      yField,
      categoryVal,
      groupVal,
      measureVal,
      undefined
    ));
  });

  return { rows, datumValues, categoryLabel, measureLabel };
}