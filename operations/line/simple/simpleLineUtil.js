import {
    clearAllAnnotations,
    delay,
    getSvgAndSetup,
    simpleLineAverage,
    simpleLineCompare,
    simpleLineCompareBool,
    simpleLineCount,
    simpleLineDetermineRange,
    simpleLineDiff,
    simpleLineFilter,
    simpleLineFindExtremum,
    simpleLineNth,
    simpleLineRetrieveValue, simpleLineSort,
    simpleLineSum
} from "./simpleLineFunctions.js";
import {OperationType} from "../../../object/operationType.js";
import {dataCache, lastCategory, lastMeasure} from "../../../util/util.js";
import {DatumValue} from "../../../object/valueType.js";
import { runOpsSequence, shrinkSvgViewBox } from "../../operationUtil.js";

/** 내부 사용: 라인 차트 데이터 저장 (renderSimpleLineChart에서 적재) */
const chartDataStore = {};

/** op → 핸들러 매핑 */
const SIMPLE_LINE_OP_HANDLERS = {
    [OperationType.RETRIEVE_VALUE]: simpleLineRetrieveValue,
    [OperationType.FILTER]:         simpleLineFilter,
    [OperationType.FIND_EXTREMUM]:  simpleLineFindExtremum,
    [OperationType.DETERMINE_RANGE]:simpleLineDetermineRange,
    [OperationType.COMPARE]:        simpleLineCompare,
    [OperationType.COMPARE_BOOL]:   simpleLineCompareBool,
    [OperationType.SORT]:           simpleLineSort,
    [OperationType.SUM]:            simpleLineSum,
    [OperationType.AVERAGE]:        simpleLineAverage,
    [OperationType.DIFF]:           simpleLineDiff,
    [OperationType.NTH]:            simpleLineNth,
    [OperationType.COUNT]:          simpleLineCount,
};

async function fullChartReset(chartId) {
    const { svg, g } = getSvgAndSetup(chartId);
    if (!svg || svg.empty()) return;

    g.selectAll(".highlighted-line").remove();
    clearAllAnnotations(svg);

    const resetPromises = [];
    const mainLine = g.select("path.series-line");
    if (!mainLine.empty()) {
        resetPromises.push(
            mainLine.transition().duration(400)
                .attr("stroke", "steelblue")
                .attr("opacity", 1)
                .end()
        );
    }

    resetPromises.push(
        g.selectAll("circle.datapoint")
            .transition().duration(400)
            .attr("opacity", 0)
            .end()
    );

    await Promise.all(resetPromises);
}

async function resetSimpleLineChart(chartId, vlSpec, ctx = {}) {
    const forceInitial = ctx?.forceInitialReset === true;
    if (ctx?.stepIndex === 0 && !forceInitial) {
        return;
    }
    const svg = d3.select(`#${chartId}`).select("svg");
    const hasSeries = !svg.empty() && !svg.select("path.series-line").empty();
    if (!hasSeries || !ctx || !ctx.isLast || forceInitial) {
        await renderSimpleLineChart(chartId, vlSpec);
        await settleFrame();
    } else {
        await fullChartReset(chartId);
    }
}

// Ensure layout/paint settles between ops (fallbacks to a short delay if rAF is unavailable)
const settleFrame = () => (typeof requestAnimationFrame === 'function'
    ? new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)))
    : delay(50));

async function applySimpleLineOperation(chartId, operation, currentData, isLast = false) {
    const fn = SIMPLE_LINE_OP_HANDLERS[operation.op];
    if (!fn) {
        console.warn(`Unsupported operation: ${operation.op}`);
        return currentData;
    }
    // Some handlers may return a plain value; Promise.resolve normalizes to a Promise
    const next = await Promise.resolve(fn(chartId, operation, currentData, isLast));
    return (next === undefined ? currentData : next);
}

async function executeSimpleLineOpsList(chartId, opsList, currentData) {
    for (let i = 0; i < opsList.length; i++) {
        const operation = opsList[i];
        const isLast = (i === opsList.length - 1);
        // 각 연산이 자신의 transition을 모두 끝낼 때까지 대기
        currentData = await applySimpleLineOperation(chartId, operation, currentData, isLast);
        // 렌더/레이아웃이 한 프레임 이상 안정화된 뒤 다음 연산으로 이동
        await settleFrame();
    }
    return currentData;
}

/** CSV 원본 → DatumValue[]로 정규화 (multiLineUtil과 동일한 철학) */
function simpleLineToDatumValues(rawData, spec) {
    const xEnc = spec.encoding?.x ?? {};
    const yEnc = spec.encoding?.y ?? {};
    const xField = xEnc.field;
    const yField = yEnc.field;

    const categoryLabel = (xEnc.axis && xEnc.axis.title) || xField || "x";
    const measureLabel  = (yEnc.axis && yEnc.axis.title) || yField || "y";

    const rows = [];
    const datumValues = [];

    (rawData || []).forEach((d, idx) => {
        const categoryVal = String(d[xField]);     // 예: "1994-01-01" (문자열 유지)
        const measureVal  = Number(d[yField]);     // 수치

        rows.push({
            [categoryLabel]: categoryVal,
            [measureLabel]: measureVal
        });

        datumValues.push(new DatumValue(
            xField,           // category key label
            yField,           // measure key label
            categoryVal,      // target (문자열)
            null,             // group (단일 라인이라 null)
            measureVal,       // value
            undefined
        ));
    });

    return { rows, datumValues, categoryLabel, measureLabel };
}

/**
 * ✅ 요구사항 반영:
 * - 버튼 기반 네비게이션으로 각 단계 제어
 * - 차트 내부 좌상단에 이전/다음 버튼 배치
 * - 🔸 모든 연산은 DatumValue[] (정규화 데이터) 기준으로 수행
 */
export async function runSimpleLineOps(chartId, vlSpec, opsSpec, textSpec = {}) {
    // 기본 차트 렌더 (D3 라인 차트)
    await renderSimpleLineChart(chartId, vlSpec);

    // 데이터 준비 (renderSimpleLineChart가 chartDataStore[chartId]에 원본 저장)
    const raw = chartDataStore[chartId] || [];
    const { datumValues, categoryLabel, measureLabel } = simpleLineToDatumValues(raw, vlSpec);

    // reset cache
    Object.keys(dataCache).forEach(key => delete dataCache[key]);

    await runOpsSequence({
        chartId,
        opsSpec,
        textSpec,
        onReset: async (ctx = {}) => { await resetSimpleLineChart(chartId, vlSpec, ctx); },
        onRunOpsList: async (opsList, isLast) => {
            const base = datumValues.slice();
            return await executeSimpleLineOpsList(chartId, opsList, base);
        },
        onCache: (opKey, currentData) => {
            const arr = Array.isArray(currentData) ? currentData : (currentData != null ? [currentData] : []);
            arr.forEach((d, idx) => {
                if (d && typeof d === "object") {
                    d.id = `${opKey}_${idx}`;
                    d.category = lastCategory ?? categoryLabel;
                    d.measure  = lastMeasure  ?? measureLabel;
                }
            });
            dataCache[opKey] = arr;
        },
        isLastKey: (k) => k === 'last',
        delayMs: 0,
        navOpts: { x: 15, y: 15 }
    });
}

export async function renderSimpleLineChart(chartId, spec) {
    const container = d3.select(`#${chartId}`);
    container.selectAll("*").remove();

    const margin = { top: 48, right: 48, bottom: 48, left: 64 };
    const innerWidth = (spec?.width ?? 560);
    const innerHeight = (spec?.height ?? 320);
    const totalWidth = innerWidth + margin.left + margin.right;
    const totalHeight = innerHeight + margin.top + margin.bottom;


    const xField = spec.encoding.x.field;
    const yField = spec.encoding.y.field;
    const xType  = spec.encoding.x.type;

    const raw = await d3.csv(spec.data.url);


    const data = raw.map(d => {
        const o = { ...d };

        o[yField] = +o[yField];

        if (xType === 'temporal') {
            // Keep as raw text even if it looks like a date
            o[xField] = String(d[xField]);
        } else if (xType === 'quantitative') {
            o[xField] = +d[xField];
        } else {
            o[xField] = String(d[xField]);
        }
        return o;
    });

    chartDataStore[chartId] = data;

    const svg = container.append("svg")
        .attr("viewBox", [0, 0, totalWidth, totalHeight])
        .attr("data-x-field", xField)
        .attr("data-y-field", yField)
        .attr("data-m-left", margin.left)
        .attr("data-m-top", margin.top)
        .attr("data-plot-w", innerWidth)
        .attr("data-plot-h", innerHeight);

    const g = svg.append("g")
        .attr("class", "plot-area")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = (xType === 'temporal')
        ? d3.scaleTime().domain(d3.extent(data, d => new Date(d[xField]))).range([0, innerWidth])
        : (xType === 'quantitative'
            ? d3.scaleLinear().domain(d3.extent(data, d => d[xField])).nice().range([0, innerWidth])
            : d3.scalePoint().domain(data.map(d => String(d[xField]))).range([0, innerWidth]));

    const yMax = d3.max(data, d => d[yField]);
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([innerHeight, 0]);

    g.append("g").attr("class", "x-axis")
        .attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(xScale));
    g.append("g").attr("class", "y-axis").call(d3.axisLeft(yScale));

    const lineGen = d3.line()
        .x(d => xType === 'temporal' ? xScale(new Date(d[xField])) : xScale(d[xField]))
        .y(d => yScale(d[yField]));

    g.append("path")
        .datum(data)
        .attr("class", "series-line")
        .attr("fill", "none")
        .attr("stroke", "steelblue")
        .attr("stroke-width", 2)
        .attr("d", lineGen);

    g.selectAll(".datapoint")
        .data(data)
        .join("circle")
        .attr("class", "datapoint")
        .attr("cx", d => xType === 'temporal' ? xScale(new Date(d[xField])) : xScale(d[xField]))
        .attr("cy", d => yScale(d[yField]))
        .attr("r", 5)
        .attr("fill", "steelblue")
        .attr("opacity", 0)
        .attr("data-id", d => String(d[xField]))
        .attr("data-key-year", d => (
            xType === 'temporal' ? new Date(d[xField]).getFullYear() : null
        ))
        .attr("data-value", d => d[yField]);

    const xLabelY = margin.top + innerHeight + 24;
    svg.append("text").attr("class", "x-axis-label")
        .attr("x", margin.left + innerWidth / 2).attr("y", xLabelY)
        .attr("text-anchor", "middle").text(xField);
    svg.append("text").attr("class", "y-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -(margin.top + innerHeight / 2)).attr("y", margin.left - 48)
        .attr("text-anchor", "middle").text(yField);

    shrinkSvgViewBox(svg, 6);
}
