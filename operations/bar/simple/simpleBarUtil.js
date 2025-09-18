import {OperationType} from "../../../object/operationType.js";
import { IntervalValue, DatumValue, BoolValue, ScalarValue } from "../../../object/valueType.js";
import {
    simpleBarAverage,
    simpleBarCompare,
    simpleBarCompareBool,
    simpleBarCount,
    simpleBarDetermineRange,
    simpleBarDiff,
    simpleBarFilter,
    simpleBarFindExtremum,
    simpleBarNth,
    simpleBarRetrieveValue,
    simpleBarSort,
    simpleBarSum
} from "./simpleBarFunctions.js";
import {
    addChartOpsText,
    buildSimpleBarSpec,
    convertToDatumValues,
    dataCache, lastCategory, lastMeasure,
    renderChart,
    stackChartToTempTable
} from "../../../util/util.js";
import { addChildDiv, clearDivChildren } from "../../operationUtil.js";

// 새로 가져온 유틸
import { createScrollyLayout, observeSteps, findScrollRoot, prefersReducedMotion } from "../../../router/routerUtil.js"

const SIMPLE_BAR_OP_HANDLERS = {
    [OperationType.RETRIEVE_VALUE]: simpleBarRetrieveValue,
    [OperationType.FILTER]:         simpleBarFilter,
    [OperationType.FIND_EXTREMUM]:  simpleBarFindExtremum,
    [OperationType.DETERMINE_RANGE]:simpleBarDetermineRange,
    [OperationType.COMPARE]:        simpleBarCompare,
    [OperationType.COMPARE_BOOL]:   simpleBarCompareBool,
    [OperationType.SORT]:           simpleBarSort,
    [OperationType.SUM]:            simpleBarSum,
    [OperationType.AVERAGE]:        simpleBarAverage,
    [OperationType.DIFF]:           simpleBarDiff,
    [OperationType.NTH]:            simpleBarNth,
    [OperationType.COUNT]:          simpleBarCount,
};

const chartDataStore = {};

function clearAllAnnotations(svg) {
    svg.selectAll(".annotation, .filter-label, .sort-label, .value-tag, .range-line, .value-line, .threshold-line, .threshold-label, .compare-label").remove();
}

function getSvgAndSetup(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    const orientation = svg.attr("data-orientation") || "vertical";
    const xField = svg.attr("data-x-field");
    const yField = svg.attr("data-y-field");
    const margins = {
        left: +svg.attr("data-m-left") || 0,
        top: +svg.attr("data-m-top") || 0,
    };
    const plot = {
        w: +svg.attr("data-plot-w") || 0,
        h: +svg.attr("data-plot-h") || 0,
    };
    const g = svg.select("g");
    return { svg, g, orientation, xField, yField, margins, plot };
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function applySimpleBarOperation(chartId, operation, currentData, isLast = false) {
    const fn = SIMPLE_BAR_OP_HANDLERS[operation.op];
    if (!fn) {
        console.warn(`Unsupported operation: ${operation.op}`);
        return currentData;
    }
    return await fn(chartId, operation, currentData, isLast);
}

async function executeSimpleBarOpsList(chartId, opsList, currentData, isLast = false, delayMs = 1500) {
    for (let i = 0; i < opsList.length; i++) {
        const operation = opsList[i];
        currentData = await applySimpleBarOperation(chartId, operation, currentData, isLast);
        if (delayMs > 0) {
            await delay(delayMs);
        }
    }
    return currentData;
}

export async function runSimpleBarOps(chartId, vlSpec, opsSpec, textSpec = {}) {
    const { svg, g, orientation, xField, yField, margins, plot } = getSvgAndSetup(chartId);

    clearAllAnnotations(svg);
    const resetPromises = [];
    g.selectAll("rect").each(function() {
        const rect = d3.select(this);
        const t = rect.transition().duration(400)
            .attr("fill", "#69b3a2")
            .attr("opacity", 1)
            .attr("stroke", "none")
            .end();
        resetPromises.push(t);
    });
    await Promise.all(resetPromises);

    if (!chartDataStore[chartId]) {
        console.error("runSimpleBarOps: No data in store. Please render the chart first.");
        return;
    }
    const fullData = [...chartDataStore[chartId]];
    let data = convertToDatumValues(fullData, xField, yField, orientation);

    const operationKeys = Object.keys(opsSpec);

    // 여기부터 Scrolly telling 모드
    // chartId host를 scrolly 레이아웃으로 변경
    const { hostEl, rootEl, graphicEl, graphicId, stepsEl } = createScrollyLayout(chartId, { stickyTop: 12 });

    // textSpec에 있는 각 opKey에 대한 설명 텍스트 step으로 만들기
    for (const opKey of operationKeys) {
        const step = document.createElement('section');
        step.className = 'step';
        step.dataset.op = opKey;

        const textDiv = document.createElement('div');
        const textId = `${graphicId}-${opKey}-text`;
        textDiv.id = textId;
        step.appendChild(textDiv);
        stepsEl.appendChild(step);

        // 기존에 제공하던 설명 붙이기
        addChartOpsText(textId, textSpec[opKey]);
    }

    // 기본 차트 한 번 렌더
    await renderChart(graphicId, vlSpec);

    const baseDatumValues = convertToDatumValues(fullData, xField, yField, orientation);

    // dataCache 초기화
    Object.keys(dataCache).forEach(key => delete dataCache[key]);

    const zeroDelay = prefersReducedMotion() ? 0 : 0;  // study 환경에서는 애니메이션 지양

    observeSteps({
        rootEl: rootEl,
        stepsEl: stepsEl,
        onEnter: async (opKey, stepEl, idx) => {
            // 활성 step 시 그래픽 리셋
            clearAllAnnotations(d3.select(`#${graphicId}`));
            await renderChart(graphicId, vlSpec);  // base 상태

            const opsList = opsSpec[opKey] || [];
            if (opKey === 'last') {
                // 마지막 단계일 경우에는 누적 혹은 특수 처리
                const allDatumValues = Object.values(dataCache).flat();
                const allSpec = buildSimpleBarSpec(allDatumValues);
                await renderChart(graphicId, allSpec);
                await executeSimpleBarOpsList(graphicId, opsList, allDatumValues, true, zeroDelay);
            } else {
                let currentData2 = baseDatumValues;
                await executeSimpleBarOpsList(graphicId, opsList, currentData2, false, zeroDelay);
                // cache 저장
                if (currentData2 instanceof IntervalValue || currentData2 instanceof BoolValue || currentData2 instanceof ScalarValue) {
                    dataCache[opKey] = [currentData2];
                } else {
                    const arr = Array.isArray(currentData2) ? currentData2 : (currentData2 != null ? [currentData2] : []);
                    arr.forEach((datum, idx) => {
                        if (datum instanceof DatumValue) {
                            datum.id = `${opKey}_${idx}`;
                            datum.category = lastCategory;
                            datum.measure = lastMeasure;
                        }
                    });
                    dataCache[opKey] = arr;
                }
            }
        },
        threshold: 0.6
    });

    // cleanup: 데이터 캐시 비워둠
    // (선택적으로 이전 상태들 삭제)
}

export async function renderSimpleBarChart(chartId, spec) {
    const yField = spec.encoding.y.field;
    const xField = spec.encoding.x.field;
    const xType = spec.encoding.x.type;
    const yType = spec.encoding.y.type;
    const isHorizontal = xType === 'quantitative' && yType !== 'quantitative';

    let data;
    if (spec.data && Array.isArray(spec.data.values)) {
        data = spec.data.values.map(d => ({...d}));
    } else if (spec.data && typeof spec.data.url === 'string') {
        if (spec.data.url.endsWith('.json')) {
            data = await d3.json(spec.data.url);
        } else {
            data = await d3.csv(spec.data.url);
        }
    } else {
        console.warn('renderSimpleBarChart: spec.data.values or spec.data.url is required');
        data = [];
    }

    data.forEach(d => {
        if (xType === 'quantitative') d[xField] = +d[xField];
        if (yType === 'quantitative') d[yField] = +d[yField];
    });

    if (spec.transform) {
        spec.transform.forEach(t => {
            if (t.filter) {
                const expr = t.filter.replace(/datum\./g, 'd.');
                const filterFn = new Function('d', `return ${expr};`);
                data = data.filter(filterFn);
            }
        });
    }

    const enc = spec.encoding;
    const agg = enc.x.aggregate || enc.y.aggregate;
    if (agg) {
        const groupField = enc.x.aggregate ? enc.y.field : enc.x.field;
        const valueField = enc.x.aggregate ? enc.x.field : enc.y.field;
        data = Array.from(
            d3.rollup(
                data,
                v => d3[agg](v, d => +d[valueField]),
                d => d[groupField]
            )
        ).map(([key, value]) => ({
            [groupField]: key,
            [valueField]: value
        }));
    }

    chartDataStore[chartId] = data;

    const margin = {top: 40, right: 20, bottom: 80, left: 60};
    const width = 600;
    const height = 300;
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const host = d3.select(`#${chartId}`);
    host.selectAll("*").remove();

    const svg = host.append("svg")
        .attr("viewBox", [0, 0, width, height])
        .style("overflow", "visible")
        .attr("data-orientation", isHorizontal ? "horizontal" : "vertical")
        .attr("data-m-left", margin.left)
        .attr("data-m-top", margin.top)
        .attr("data-plot-w", plotW)
        .attr("data-plot-h", plotH)
        .attr("data-x-field", xField)
        .attr("data-y-field", yField);

    svg.attr("data-x-sort-order", spec.encoding.x.sort ? spec.encoding.x.sort.join(',') : null);

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    if (isHorizontal) {
        const xScale = d3.scaleLinear()
            .domain([0, d3.max(data, d => d[xField])]).nice()
            .range([0, plotW]);
        const yScale = d3.scaleBand()
            .domain(data.map(d => d[yField]))
            .range([0, plotH])
            .padding(0.2);

        g.append("g")
            .attr("class", "y-axis")
            .call(d3.axisLeft(yScale));
        g.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${plotH})`)
            .call(d3.axisBottom(xScale).ticks(5));

        g.selectAll("rect")
            .data(data)
            .join("rect")
            .attr("x", 0)
            .attr("y", d => yScale(d[yField]))
            .attr("width", d => xScale(d[xField]))
            .attr("height", yScale.bandwidth())
            .attr("fill", "#69b3a2")
            .attr("data-id", d => d[yField])
            .attr("data-value", d => d[xField]);
    } else {
        const xDomain = spec.encoding.x.sort || data.map(d => d[xField]);
        const xScale = d3.scaleBand()
            .domain(xDomain)
            .range([0, plotW])
            .padding(0.2);
        const yScale = d3.scaleLinear()
            .domain([0, d3.max(data, d => d[yField])]).nice()
            .range([plotH, 0]);

        g.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${plotH})`)
            .call(d3.axisBottom(xScale))
            .selectAll("text")
            .attr("transform", "rotate(-45)")
            .style("text-anchor", "end");

        g.append("g")
            .attr("class", "y-axis")
            .call(d3.axisLeft(yScale).ticks(5));

        g.selectAll("rect")
            .data(data)
            .join("rect")
            .attr("x", d => xScale(d[xField]))
            .attr("y", d => yScale(d[yField]))
            .attr("width", xScale.bandwidth())
            .attr("height", d => plotH - yScale(d[yField]))
            .attr("fill", "#69b3a2")
            .attr("data-id", d => d[xField])
            .attr("data-value", d => d[yField]);
    }

    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("x", margin.left + plotW / 2)
        .attr("y", height - margin.bottom + 40)
        .attr("text-anchor", "middle")
        .attr("font-size", 14)
        .text(xField);

    svg.append("text")
        .attr("class", "y-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -(margin.top + plotH / 2))
        .attr("y", margin.left - 45)
        .attr("text-anchor", "middle")
        .attr("font-size", 14)
        .text(yField);
}