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
import {convertToDatumValues, dataCache, lastCategory, lastMeasure} from "../../../util/util.js";
import {DatumValue} from "../../../object/valueType.js";
import { updateOpCaption, attachOpNavigator, updateNavigatorStates, runOpsSequence } from "../../operationUtil.js";

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
    g.selectAll(".highlighted-line").remove();
    clearAllAnnotations(svg);

    const resetPromises = [];

    resetPromises.push(g.select("path.series-line").transition().duration(400)
        .attr("stroke", "steelblue").attr("opacity", 1).end());

    resetPromises.push(g.selectAll("circle.datapoint").transition().duration(400)
        .attr("opacity", 0).end());

    await Promise.all(resetPromises);
}


async function applySimpleLineOperation(chartId, operation, currentData) {
    const fn = SIMPLE_LINE_OP_HANDLERS[operation.op];
    if (!fn) {
        console.warn(`Unsupported operation: ${operation.op}`);
        return currentData;
    }
    return await fn(chartId, operation, currentData);
}

async function executeSimpleLineOpsList(chartId, opsList, currentData) {
    for (let i = 0; i < opsList.length; i++) {
        const operation = opsList[i];
        currentData = await applySimpleLineOperation(chartId, operation, currentData);

        await delay(2000);

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
        onReset: async () => { await fullChartReset(chartId); },
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

    const margin = { top: 60, right: 60, bottom: 50, left: 80 }; // top 마진을 늘려서 버튼 공간 확보
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

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
        .attr("viewBox", [0, 0, width + margin.left + margin.right, height + margin.top + margin.bottom])
        .attr("data-x-field", xField)
        .attr("data-y-field", yField)
        .attr("data-m-left", margin.left)
        .attr("data-m-top", margin.top)
        .attr("data-plot-w", width)
        .attr("data-plot-h", height);

    const g = svg.append("g")
        .attr("class", "plot-area")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = (xType === 'temporal')
        ? d3.scaleTime().domain(d3.extent(data, d => new Date(d[xField]))).range([0, width])
        : (xType === 'quantitative'
            ? d3.scaleLinear().domain(d3.extent(data, d => d[xField])).nice().range([0, width])
            : d3.scalePoint().domain(data.map(d => String(d[xField]))).range([0, width]));

    const yMax = d3.max(data, d => d[yField]);
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([height, 0]);

    g.append("g").attr("class", "x-axis")
        .attr("transform", `translate(0,${height})`).call(d3.axisBottom(xScale));
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

    svg.append("text").attr("class", "x-axis-label")
        .attr("x", margin.left + width / 2).attr("y", height + margin.top + margin.bottom - 10)
        .attr("text-anchor", "middle").text(xField);
    svg.append("text").attr("class", "y-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -(margin.top + height / 2)).attr("y", margin.left - 60)
        .attr("text-anchor", "middle").text(yField);
}