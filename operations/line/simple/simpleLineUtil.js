import {
    simpleLineCompare,
    simpleLineDetermineRange,
    simpleLineFilter,
    simpleLineFindExtremum,
    simpleLineRetrieveValue,
    getSvgAndSetup,
    clearAllAnnotations,
    delay,
    simpleLineSum,
    simpleLineAverage,
    simpleLineDiff,
    simpleLineCount,
    simpleLineNth,
    simpleLineCompareBool
} from "./simpleLineFunctions.js";
import { OperationType } from "../../../object/operationType.js";
import { DatumValue } from "../../../object/valueType.js";
import {
    dataCache,        // 결과 누적/캐시
    lastCategory,
    lastMeasure
} from "../../../util/util.js";

// 🔹 Scrollytelling 헬퍼
import { createScrollyLayout, observeSteps, prefersReducedMotion } from "../../../router/routerUtil.js";

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
    [OperationType.SUM]:            simpleLineSum,
    [OperationType.AVERAGE]:        simpleLineAverage,
    [OperationType.DIFF]:           simpleLineDiff,
    [OperationType.NTH]:            simpleLineNth,
    [OperationType.COUNT]:          simpleLineCount,
};

/** 현재 차트의 하이라이트/주석 등 시각 상태를 리셋 */
async function fullChartReset(chartId) {
    const { svg, g } = getSvgAndSetup(chartId);
    g.selectAll(".highlighted-line").remove();
    clearAllAnnotations(svg);

    const resetPromises = [];
    const baseLine = g.select("path.series-line");
    if (!baseLine.empty()) {
        resetPromises.push(
            baseLine.transition().duration(200)
                .attr("stroke", "steelblue").attr("opacity", 1).end()
        );
    }
    const points = g.selectAll("circle.datapoint");
    if (!points.empty()) {
        resetPromises.push(points.transition().duration(200).attr("opacity", 0).end());
    }
    await Promise.all(resetPromises);
}

/** 단일 operation 실행 */
async function applySimpleLineOperation(chartId, operation, currentData) {
    const fn = SIMPLE_LINE_OP_HANDLERS[operation.op];
    if (!fn) {
        console.warn(`Unsupported operation: ${operation.op}`);
        return currentData;
    }
    return await fn(chartId, operation, currentData);
}

/** 여러 operation을 순서대로 실행 (연구 공정성 위해 기본 delay=0) */
async function executeSimpleLineOpsList(chartId, opsList, currentData, delayMs = 0) {
    for (let i = 0; i < opsList.length; i++) {
        currentData = await applySimpleLineOperation(chartId, opsList[i], currentData);
        if (delayMs > 0) await delay(delayMs);
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
 * - 첫 번째 키(예: "ops")만 즉시 실행
 * - 이후 스크롤로 다음 스텝이 활성화될 때만 다음 세트(예: "ops2") 실행
 * - 🔸 모든 연산은 DatumValue[] (정규화 데이터) 기준으로 수행
 */
export async function runSimpleLineOps(chartId, vlSpec, opsSpec) {
    // #chart 컨테이너를 scrolly 구조로 재구성 (sticky 그래픽 + 스텝)
    const { rootEl, graphicId, stepsEl } = createScrollyLayout(chartId, { stickyTop: 12 });

    // 스텝 생성 (opsSpec의 키 순서 유지)
    const keys = Object.keys(opsSpec);
    if (keys.length === 0) return;

    keys.forEach((k) => {
        const step = document.createElement("section");
        step.className = "step";
        step.dataset.op = k;
        stepsEl.appendChild(step);
    });

    // 기본 차트 렌더 (D3 라인 차트)
    await renderSimpleLineChart(graphicId, vlSpec);

    // 데이터 준비 (renderSimpleLineChart가 chartDataStore[graphicId]에 원본 저장)
    const raw = chartDataStore[graphicId] || [];
    const { datumValues, categoryLabel, measureLabel } = simpleLineToDatumValues(raw, vlSpec);

    const zeroDelay = prefersReducedMotion() ? 0 : 0;
    const executed = new Set(); // 이미 실행된 스텝 기록

    // 각 스텝을 실행하는 공통 루틴 (항상 베이스부터 다시 그림)
    const runStep = async (opKey) => {
        await renderSimpleLineChart(graphicId, vlSpec);
        await fullChartReset(graphicId);

        // ops 실행 (항상 DatumValue[] 기준)
        const opsList = opsSpec[opKey] || [];
        let currentData = datumValues.slice(); // 베이스 복사
        currentData = await executeSimpleLineOpsList(graphicId, opsList, currentData, zeroDelay);

        // 캐시 저장 (형식 통일: 배열화 + 메타 필드)
        const arr = Array.isArray(currentData) ? currentData : (currentData != null ? [currentData] : []);
        arr.forEach((d, idx) => {
            if (d && typeof d === "object") {
                d.id = `${opKey}_${idx}`;
                // lastCategory/lastMeasure가 설정되는 파이프라인을 존중하되, 없으면 라벨로 대체
                d.category = lastCategory ?? categoryLabel;
                d.measure  = lastMeasure  ?? measureLabel;
            }
        });
        dataCache[opKey] = arr;
        executed.add(opKey);
    };

    // 🔸 초기: 첫 번째 키만 즉시 실행 (예: "ops")
    await runStep(keys[0]);

    // 🔸 이후: 스크롤로 다음 스텝이 활성화될 때만 실행
    observeSteps({
        rootEl,
        stepsEl,
        threshold: 0.6,
        onEnter: async (opKey) => {
            if (executed.has(opKey)) return; // 이미 실행했다면 무시
            await runStep(opKey);
        }
    });
}

/**
 * D3 라인 차트 렌더링 (데이터를 chartDataStore[chartId]에 적재)
 */
export async function renderSimpleLineChart(chartId, spec) {
    const container = d3.select(`#${chartId}`);
    container.selectAll("*").remove();

    const margin = { top: 40, right: 60, bottom: 50, left: 80 };
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const xField = spec.encoding.x.field;
    const yField = spec.encoding.y.field;
    const xType  = spec.encoding.x.type;

    const raw = await d3.csv(spec.data.url);

    // 날짜도 "항상 텍스트"로 유지 → 내부 로직에서 Date 파싱이 필요하면 그때만 변환
    const data = raw.map(d => {
        const o = { ...d };
        o[yField] = +o[yField];
        if (xType === "temporal") {
            o[xField] = String(d[xField]);
        } else if (xType === "quantitative") {
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

    // 스케일 (xType이 temporal이어도 여기서는 렌더링용으로만 Date 파싱)
    const xScale = (xType === "temporal")
        ? d3.scaleTime()
            .domain(d3.extent(data, d => new Date(d[xField])))
            .range([0, width])
        : (xType === "quantitative"
            ? d3.scaleLinear()
                .domain(d3.extent(data, d => d[xField])).nice()
                .range([0, width])
            : d3.scalePoint()
                .domain(data.map(d => String(d[xField])))
                .range([0, width]));

    const yMax = d3.max(data, d => d[yField]);
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([height, 0]);

    g.append("g").attr("class", "x-axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale));
    g.append("g").attr("class", "y-axis").call(d3.axisLeft(yScale));

    const lineGen = d3.line()
        .x(d => xType === "temporal" ? xScale(new Date(d[xField])) : xScale(d[xField]))
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
        .attr("cx", d => xType === "temporal" ? xScale(new Date(d[xField])) : xScale(d[xField]))
        .attr("cy", d => yScale(d[yField]))
        .attr("r", 5)
        .attr("fill", "steelblue")
        .attr("opacity", 0)
        .attr("data-id", d => String(d[xField]))
        .attr("data-key-year", d => (xType === "temporal" ? new Date(d[xField]).getFullYear() : null))
        .attr("data-value", d => d[yField]);

    svg.append("text").attr("class", "x-axis-label")
        .attr("x", margin.left + width / 2)
        .attr("y", height + margin.top + margin.bottom - 10)
        .attr("text-anchor", "middle")
        .text(xField);

    svg.append("text").attr("class", "y-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -(margin.top + height / 2))
        .attr("y", margin.left - 60)
        .attr("text-anchor", "middle")
        .text(yField);
}