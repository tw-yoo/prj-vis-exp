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

async function executeSimpleBarOpsList(chartId, opsList, currentData, isLast = false, delayMs = 0) {
    for (let i = 0; i < opsList.length; i++) {
        const operation = opsList[i];
        currentData = await applySimpleBarOperation(chartId, operation, currentData, isLast);
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

    console.log("Navigation controls created successfully for:", chartId);
    
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
 * 차트 리셋
 */
async function fullChartReset(chartId) {
    const { svg, g } = getSvgAndSetup(chartId);
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
}

export async function runSimpleBarOps(chartId, vlSpec, opsSpec, textSpec = {}) {
    // 차트가 먼저 렌더링되었는지 확인
    const svg = d3.select(`#${chartId}`).select("svg");
    if (svg.empty()) {
        console.error("runSimpleBarOps: SVG not found. Please render the chart first.");
        return;
    }
    
    if (!chartDataStore[chartId]) {
        console.error("runSimpleBarOps: No data in store. Please render the chart first.");
        return;
    }
    
    const fullData = [...chartDataStore[chartId]];
    const { orientation, xField, yField } = getSvgAndSetup(chartId);
    const baseDatumValues = convertToDatumValues(fullData, xField, yField, orientation);

    const keys = Object.keys(opsSpec);
    if (keys.length === 0) return;

    let currentStep = 0;
    const totalSteps = keys.length;
    const zeroDelay = 0;

    // 네비게이션 컨트롤 생성 (한 번만) - SVG 존재 확인 후
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

        const opsList = opsSpec[opKey] || [];
        let currentData = baseDatumValues.slice(); // 베이스 복사

        if (opKey === 'last') {
            // 마지막 단계일 경우에는 누적 혹은 특수 처리
            const allDatumValues = Object.values(dataCache).flat();
            const allSpec = buildSimpleBarSpec(allDatumValues);
            await renderChart(chartId, allSpec);
            await executeSimpleBarOpsList(chartId, opsList, allDatumValues, true, zeroDelay);
        } else {
            currentData = await executeSimpleBarOpsList(chartId, opsList, currentData, false, zeroDelay);
            
            // cache 저장
            if (currentData instanceof IntervalValue || currentData instanceof BoolValue || currentData instanceof ScalarValue) {
                dataCache[opKey] = [currentData];
            } else {
                const arr = Array.isArray(currentData) ? currentData : (currentData != null ? [currentData] : []);
                arr.forEach((datum, idx) => {
                    if (datum instanceof DatumValue) {
                        datum.id = `${opKey}_${idx}`;
                        datum.category = lastCategory ?? xField;
                        datum.measure = lastMeasure ?? yField;
                    }
                });
                dataCache[opKey] = arr;
            }
        }
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

    const margin = {top: 60, right: 20, bottom: 80, left: 60}; // top 마진 증가
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