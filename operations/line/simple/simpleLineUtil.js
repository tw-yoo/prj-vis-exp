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

/**
 * ✅ 요구사항 반영:
 * - 버튼 기반 네비게이션으로 각 단계 제어
 * - 차트 내부 좌상단에 이전/다음 버튼 배치
 * - 🔸 모든 연산은 DatumValue[] (정규화 데이터) 기준으로 수행
 */
export async function runSimpleLineOps(chartId, vlSpec, opsSpec) {
    // 기본 차트 렌더 (D3 라인 차트)
    await renderSimpleLineChart(chartId, vlSpec);

    // 데이터 준비 (renderSimpleLineChart가 chartDataStore[chartId]에 원본 저장)
    const raw = chartDataStore[chartId] || [];
    const { datumValues, categoryLabel, measureLabel } = simpleLineToDatumValues(raw, vlSpec);

    const keys = Object.keys(opsSpec);
    if (keys.length === 0) return;

    let currentStep = 0;
    const totalSteps = keys.length;
    const zeroDelay = 0;

    // 네비게이션 컨트롤 생성 (한 번만)
    const { nextButton, stepIndicator } = createNavigationControls(chartId);

    // 각 스텝을 실행하는 공통 루틴
    const runStep = async (stepIndex) => {
        const opKey = keys[stepIndex];
        
        // 차트 리셋만 하고 재렌더링하지 않음
        await fullChartReset(chartId);

        // ops 실행 (항상 DatumValue[] 기준)
        const opsList = opsSpec[opKey] || [];
        let currentData = datumValues.slice(); // 베이스 복사
        currentData = await executeSimpleLineOpsList(chartId, opsList, currentData, zeroDelay);

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

    // 🔸 초기: 첫 번째 키 실행 (예: "ops")
    await runStep(0);
    updateButtonStates(nextButton, stepIndicator, currentStep, totalSteps);
}

/**
 * D3 라인 차트 렌더링 (데이터를 chartDataStore[chartId]에 적재)
 */
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