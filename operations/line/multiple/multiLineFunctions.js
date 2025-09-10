import { DatumValue, BoolValue, IntervalValue } from "../../../object/valueType.js";
import {
    retrieveValue as dataRetrieveValue,
    filter as dataFilter,
    sort as dataSort,
    sum as dataSum,
    average as dataAverage,
    diff as dataDiff,
    nth as dataNth,
    compareBool as dataCompareBool,
    count as dataCount
} from "../../operationFunctions.js";

// ---------- 헬퍼(Helper) 함수들 ----------

const fmtISO = d3.timeFormat("%Y-%m-%d");

/**
 * 차트의 SVG와 기본 설정 정보를 가져옵니다.
 * @param {string} chartId - 차트의 ID
 * @returns {object} SVG 요소 및 차트 관련 정보
 */
function getSvgAndSetup(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    const g = svg.select(".plot-area");
    const margins = { left: +svg.attr("data-m-left") || 0, top: +svg.attr("data-m-top") || 0 };
    const plot = { w: +svg.attr("data-plot-w") || 0, h: +svg.attr("data-plot-h") || 0 };
    const xField = svg.attr("data-x-field");
    const yField = svg.attr("data-y-field");
    const colorField = svg.attr("data-color-field");
    return { svg, g, margins, plot, xField, yField, colorField };
}

/**
 * SVG 내의 모든 어노테이션을 제거합니다.
 * @param {d3.Selection} svg - d3 SVG selection
 */
function clearAllAnnotations(svg) {
    svg.selectAll(".annotation").remove();
}

/**
 * 지정된 시간(ms)만큼 지연시키는 Promise를 반환합니다.
 * @param {number} ms - 지연 시간 (밀리초)
 */
const delay = (ms) => new Promise(res => setTimeout(res, ms));

/**
 * 입력값을 Date 객체로 파싱합니다.
 * @param {*} v - 파싱할 값
 * @returns {Date|null} 파싱된 Date 객체 또는 실패 시 null
 */
function parseDate(v) {
    if (v instanceof Date) return v;
    const d = new Date(v);
    if (!isNaN(+d)) return d;
    if (typeof v === "string" && /^\d{4}$/.test(v)) return new Date(+v, 0, 1);
    return null;
}

/**
 * 데이터와 플롯 크기를 기반으로 x, y 스케일을 생성합니다.
 * @param {Array<object>} data - 차트 데이터
 * @param {object} plot - 플롯의 너비와 높이
 * @returns {{xScale: d3.Scale, yScale: d3.Scale}} 생성된 스케일
 */
function buildScales(data, plot) {
    const xVals = data.map(d => d.target);
    const isTemporal = xVals.every(v => v instanceof Date);
    const xScale = isTemporal
        ? d3.scaleTime().domain(d3.extent(xVals)).range([0, plot.w])
        : d3.scalePoint().domain(xVals).range([0, plot.w]);

    const yValues = data.map(d => d.value).filter(v => Number.isFinite(v));
    const yMax = d3.max(yValues);
    const yMin = d3.min(yValues);
    const yScale = d3.scaleLinear().domain([yMin > 0 ? 0 : yMin, yMax]).nice().range([plot.h, 0]);

    return { xScale, yScale };
}

/**
 * 특정 카테고리와 시리즈에 해당하는 데이터 포인트를 찾습니다.
 * @param {Array<object>} data - 전체 데이터
 * @param {object} targetSpec - 찾을 대상의 명세 { category, series }
 * @returns {object|null} 찾은 데이터 또는 null
 */
function findDatum(data, targetSpec) {
    const targetDate = parseDate(targetSpec.category);
    if (!targetDate) return null;
    const targetSeries = targetSpec.series;

    return data.find(d => {
        const dDate = parseDate(d.target);
        if (!dDate) return false;

        const isSameDay = dDate.getFullYear() === targetDate.getFullYear() &&
                          dDate.getMonth() === targetDate.getMonth() &&
                          dDate.getDate() === targetDate.getDate();

        return isSameDay && d.group === targetSeries;
    });
};

/**
 * 데이터에서 최소값 또는 최대값을 가진 모든 데이터 포인트를 찾습니다.
 * @param {Array<object>} data - 데이터
 * @param {object} op - 연산 옵션 (which: 'min' 또는 'max')
 * @returns {Array<object>} 극값에 해당하는 데이터 배열
 */
function findAllExtremumData(data, op) {
    if (!Array.isArray(data) || data.length === 0) return [];
    const which = op.which || 'max';
    const values = data.map(d => d.value).filter(Number.isFinite);
    if (values.length === 0) return [];

    const extremumValue = which === 'min' ? Math.min(...values) : Math.max(...values);
    
    return data.filter(d => d.value === extremumValue);
}

/**
 * 데이터의 최소값, 최대값 및 해당 데이터 포인트를 찾습니다.
 * @param {Array<object>} data - 데이터
 * @returns {object|null} 범위 정보 또는 null
 */
function determineRangeData(data) {
    if (!Array.isArray(data) || data.length === 0) return null;
    const values = data.map(d => d.value).filter(v => typeof v === 'number' && isFinite(v));
    if (values.length === 0) return null;

    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const minDatums = data.filter(d => d.value === minV);
    const maxDatums = data.filter(d => d.value === maxV);

    return { minV, maxV, minDatums, maxDatums };
}


// ---------- 오퍼레이션 시각화 함수들 ----------

/**
 * 특정 x축 값에 해당하는 모든 시리즈의 값을 찾아 시각화합니다.
 */
export async function multipleLineRetrieveValue(chartId, op, data) {
    const { svg, g, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // 1. 데이터 연산
    const targetDatums = data.filter(d => {
        const d_str = d.target instanceof Date ? fmtISO(d.target) : String(d.target);
        const op_str = parseDate(op.target) ? fmtISO(parseDate(op.target)) : String(op.target);
        return d_str === op_str;
    });

    if (targetDatums.length === 0) {
        console.warn(`RetrieveValue: no data found for target: ${op.target}`);
        return [];
    }

    // 2. 시각화
    const { xScale, yScale } = buildScales(data, plot);
    const allSeries = Array.from(new Set(data.map(d => d.group)));
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(allSeries);
    const cx = xScale(targetDatums[0].target);

    await g.selectAll("path.series-line").transition().duration(500)
        .attr("opacity", 0.3)
        .attr("stroke-width", 1.5)
        .end().catch(err => {});

    g.append("line").attr("class", "annotation")
        .attr("x1", cx).attr("y1", plot.h)
        .attr("x2", cx).attr("y2", 0)
        .attr("stroke", "#333").attr("stroke-dasharray", "4 4");

    targetDatums.forEach(datum => {
        const cy = yScale(datum.value);
        const color = colorScale(datum.group);

        g.append("line").attr("class", "annotation")
            .attr("x1", 0).attr("y1", cy)
            .attr("x2", cx).attr("y2", cy)
            .attr("stroke", color).attr("stroke-dasharray", "2 2")
            .attr("opacity", 0.7);

        g.append("circle").attr("class", "annotation")
            .attr("cx", cx).attr("cy", cy).attr("r", 0)
            .attr("fill", color).attr("stroke", "white").attr("stroke-width", 2)
            .transition().duration(400).delay(200)
            .attr("r", 6);

        g.append("text").attr("class", "annotation")
            .attr("x", cx + 8).attr("y", cy)
            .attr("dominant-baseline", "middle")
            .attr("fill", color).attr("font-weight", "bold")
            .text(datum.value.toLocaleString())
            .attr("opacity", 0)
            .transition().duration(400).delay(300)
            .attr("opacity", 1);
    });

    return targetDatums;
}

/**
 * 데이터를 필터링하고 차트를 필터링된 데이터에 맞게 재구성합니다.
 */
export async function multipleLineFilter(chartId, op, data) {
    const { svg, g, xField, yField, colorField, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // 1. 데이터 연산
    let filteredData;
    if (op.field === xField && op.operator === 'between' && Array.isArray(op.value)) {
        const [startDate, endDate] = op.value.map(d => parseDate(d));
        if (startDate && endDate) {
            filteredData = data.filter(d => d.target >= startDate && d.target <= endDate);
        } else {
            filteredData = [];
        }
    } else {
        const opForFilter = { ...op };
        if (opForFilter.field === colorField) opForFilter.field = 'group';
        if (opForFilter.field === yField) opForFilter.field = 'value';
        
        if (opForFilter.field === 'group') {
             opForFilter.operator = 'in';
             if (!Array.isArray(opForFilter.value)) opForFilter.value = [opForFilter.value];
        }
        filteredData = dataFilter(data, opForFilter);
    }

    // 2. 시각화
    const { xScale: originalXScale, yScale: originalYScale } = buildScales(data, plot);
    const allLines = g.selectAll("path.series-line");
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(data.map(d => d.group));

    // Stage 1: 필터 기준선 표시
    if (op.field === yField) {
        const yPos = originalYScale(op.value);
        g.append("line").attr("class", "annotation")
            .attr("x1", 0).attr("y1", yPos).attr("x2", plot.w).attr("y2", yPos)
            .attr("stroke", "red").attr("stroke-width", 2).attr("stroke-dasharray", "6 4");
    } else if (op.field === xField && op.operator === 'between' && Array.isArray(op.value)) {
        const [startDate, endDate] = op.value.map(d => parseDate(d));
        if (startDate && endDate) {
            const xStart = originalXScale(startDate);
            const xEnd = originalXScale(endDate);
            g.append("rect").attr("class", "annotation").attr("x", xStart).attr("y", 0).attr("width", xEnd - xStart).attr("height", plot.h).attr("fill", "steelblue").attr("opacity", 0.15);
        }
    }

    await delay(800);

    if (filteredData.length === 0) {
        await g.selectAll(".annotation, path.series-line, circle.datapoint").transition().duration(500).attr("opacity", 0).remove().end();
        return [];
    }

    // Stage 2: 필터링된 데이터 하이라이트
    allLines.transition().duration(1000).attr("opacity", 0.1);
    g.selectAll("circle.datapoint").transition().duration(1000).attr("opacity", 0).remove();

    const highlightLineGen = d3.line().x(d => originalXScale(d.target)).y(d => originalYScale(d.value));
    const filteredSeries = d3.groups(filteredData, d => d.group);

    g.selectAll(".highlight-line")
        .data(filteredSeries)
        .join("path")
        .attr("class", "annotation highlight-line")
        .attr("fill", "none")
        .attr("stroke", d => colorScale(d[0]))
        .attr("stroke-width", 2.5)
        .attr("opacity", 0)
        .attr("d", d => highlightLineGen(d[1]))
        .transition().duration(800)
        .attr("opacity", 1);

    await delay(1200);

    // Stage 3: 새로운 스케일로 전환
    g.selectAll(".annotation:not(.highlight-line)").transition().duration(500).attr("opacity", 0).remove();
    
    const { xScale: newXScale, yScale: newYScale } = buildScales(filteredData, plot);
    const newLineGen = d3.line().x(d => newXScale(d.target)).y(d => newYScale(d.value));

    await Promise.all([
        g.select(".x-axis").transition().duration(1200).call(d3.axisBottom(newXScale)).end(),
        g.select(".y-axis").transition().duration(1200).call(d3.axisLeft(newYScale)).end(),
        allLines.transition().duration(800).attr("opacity", 0).remove().end(),
        g.selectAll(".highlight-line")
            .transition().duration(1200)
            .attr("d", d => newLineGen(d[1]))
            .end()
    ]);

    g.selectAll(".highlight-line").attr("class", "series-line").classed("annotation", false);

    return filteredData;
}

/**
 * 특정 시리즈 하나만 선택하여 심플 라인 차트처럼 변환합니다.
 */
export async function multipleLineChangeToSimple(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    
    // 1. 데이터 연산
    const targetSeriesKey = op.group;
    if (!targetSeriesKey) {
        console.warn("ChangeToSimple requires a 'group' property.");
        return data;
    }
    const filteredData = data.filter(d => d.group === targetSeriesKey);

    if (filteredData.length === 0) {
        console.warn(`Series with key '${targetSeriesKey}' not found.`);
        return [];
    }

    // 2. 시각화
    const allSeries = Array.from(new Set(data.map(d => d.group)));
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(allSeries);
    const highlightColor = colorScale(targetSeriesKey);
    
    const allLines = g.selectAll("path.series-line");
    const targetLine = allLines.filter(function(d) { return d3.select(this).attr('data-series-key') === targetSeriesKey; });
    const otherLines = allLines.filter(function(d) { return d3.select(this).attr('data-series-key') !== targetSeriesKey; });

    if (targetLine.empty()) {
        return filteredData;
    }

    // Stage 1: 다른 라인과 범례 숨기기
    await Promise.all([
        otherLines.transition().duration(800).attr("opacity", 0).remove().end(),
        targetLine.transition().duration(800).attr("stroke-width", 3.5).end(),
        svg.select(".legend").transition().duration(800).attr("opacity", 0).remove().end()
    ]).catch(() => {});

    // Stage 2: 선택된 시리즈에 맞춰 축과 라인 재조정
    const { xScale, yScale } = buildScales(filteredData, plot);

    const lineGen = d3.line()
        .x(d => xScale(d.target))
        .y(d => yScale(d.value));

    await Promise.all([
        targetLine.datum(filteredData).transition().duration(1000).attr("d", lineGen).end(),
        g.select(".y-axis").transition().duration(1000).call(d3.axisLeft(yScale)).end(),
        g.select(".x-axis").transition().duration(1000).call(d3.axisBottom(xScale)).end()
    ]).catch(() => {});
    
    // Stage 3: 데이터 포인트 추가 및 제목 표시
    g.selectAll("circle.datapoint").remove();
    g.selectAll("circle.datapoint")
        .data(filteredData)
        .join("circle")
        .attr("class", "datapoint")
        .attr("cx", d => xScale(d.target))
        .attr("cy", d => yScale(d.value))
        .attr("r", 5)
        .attr("fill", highlightColor)
        .attr("opacity", 0)
        .transition().duration(500)
        .attr("opacity", 1);
        
    svg.append("text")
        .attr("class", "annotation")
        .attr("x", margins.left).attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", highlightColor)
        .text(`Displaying Series: ${targetSeriesKey}`);

    return filteredData;
}


/**
 * 데이터의 최소값 또는 최대값을 찾아 시각화합니다.
 */
export async function multipleLineFindExtremum(chartId, op, data) {
    const { svg, g, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // 1. 데이터 연산
    const extremumDatums = findAllExtremumData(data, op);

    if (extremumDatums.length === 0) return null;

    // 2. 시각화
    await g.selectAll("circle.datapoint").transition().duration(600).attr("opacity", 0).end();

    const { xScale, yScale } = buildScales(data, plot);
    const seriesColors = d3.scaleOrdinal(d3.schemeCategory10).domain(data.map(d => d.group));
    const which = op.which || 'max';
    const extremumValue = extremumDatums[0].value;

    extremumDatums.forEach(datum => {
        const cx = xScale(datum.target);
        const cy = yScale(datum.value);
        const color = seriesColors(datum.group);

        g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4").transition().duration(700).delay(200).attr("y2", plot.h);
        g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4").transition().duration(700).delay(200).attr("x2", 0);
            
        g.append("circle").attr("class", "annotation").attr("cx", cx).attr("cy", cy).attr("r", 0).attr("fill", color).attr("stroke", "white").attr("stroke-width", 2).transition().duration(500).delay(200).attr("r", 7);

        const valueText = `${which.charAt(0).toUpperCase() + which.slice(1)}: ${extremumValue.toLocaleString()}`;
        const dateText = `(${fmtISO(datum.target)})`;
        const textLabel = g.append("text").attr("class", "annotation").attr("x", cx).attr("y", cy - 20).attr("text-anchor", "middle").attr("fill", color).attr("font-weight", "bold").attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke");
        
        textLabel.append("tspan").attr("x", cx).attr("dy", "0em").text(valueText);
        textLabel.append("tspan").attr("x", cx).attr("dy", "1.2em").text(dateText);
    });

    return extremumDatums[0] || null;
}

/**
 * 데이터의 전체 범위를 찾아 시각화합니다.
 */
export async function multipleLineDetermineRange(chartId, op, data) {
    const { svg, g, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // 1. 데이터 연산
    const rangeResult = determineRangeData(data);
    if (!rangeResult) return null;

    const { minV, maxV, minDatums, maxDatums } = rangeResult;
    
    // 2. 시각화
    await g.selectAll("circle.datapoint").transition().duration(600).attr("opacity", 0).remove().end();

    const { xScale, yScale } = buildScales(data, plot);
    const seriesColors = d3.scaleOrdinal(d3.schemeCategory10).domain(data.map(d => d.group));
    const hlColor = "#0d6efd";

    const annotateValue = (value, label, datums) => {
        const yPos = yScale(value);

        g.append("line").attr("class", "annotation").attr("x1", 0).attr("y1", yPos).attr("x2", 0).attr("y2", yPos).attr("stroke", hlColor).attr("stroke-dasharray", "4 4").transition().duration(1000).attr("x2", plot.w);
        
        datums.forEach(datum => {
            const cx = xScale(datum.target);
            const color = seriesColors(datum.group);

            g.append("circle").attr("class", "annotation").attr("cx", cx).attr("cy", yPos).attr("r", 0).attr("fill", color).attr("stroke", "white").attr("stroke-width", 2).transition().duration(500).delay(200).attr("r", 7);
            g.append("text").attr("class", "annotation").attr("x", cx).attr("y", yPos - 12).attr("text-anchor", "middle").attr("font-weight", "bold").attr("fill", color).attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke").text(`${label}: ${value.toLocaleString()}`).attr("opacity", 0).transition().duration(400).delay(400).attr("opacity", 1);
        });
    };

    annotateValue(minV, "Min", minDatums);
    annotateValue(maxV, "Max", maxDatums);

    await delay(500);

    const summaryText = `Range: ${minV.toLocaleString()} ~ ${maxV.toLocaleString()}`;
    svg.append("text").attr("class", "annotation").attr("x", margins.left).attr("y", margins.top - 10).attr("font-size", 14).attr("font-weight", "bold").attr("fill", hlColor).text(summaryText).attr('opacity', 0).transition().duration(400).delay(800).attr('opacity', 1);

    return new IntervalValue(yField, minV, maxV);
}

/**
 * N번째 데이터를 찾아 순차적으로 카운팅하며 시각화합니다.
 */
export async function multipleLineNth(chartId, op, data) {
    const { svg, g, xField, yField, colorField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    
    // 1. 데이터 연산
    const opWithGroupBy = { ...op, groupBy: xField };
    const resultData = dataNth(data, opWithGroupBy);
    
    if (resultData.length === 0) return [];
    
    // 2. 시각화
    const allLines = g.selectAll("path.series-line");
    const allPoints = g.selectAll("circle.datapoint");
    if (allPoints.empty()) return [];

    let n = Number(op?.n ?? 1);
    const from = String(op?.from || 'left').toLowerCase();
    const hlColor = '#20c997';

    const sortedData = dataSort(data, { field: xField, order: 'asc' });
    const uniqueCategories = [...new Set(sortedData.map(d => d.target instanceof Date ? fmtISO(d.target) : String(d.target)))];
    
    const total = uniqueCategories.length;
    if (!Number.isFinite(n) || n <= 0 || n > total) return [];

    const sequence = from === 'right' ? uniqueCategories.slice().reverse() : uniqueCategories;
    const pickedCategory = sequence[n - 1];

    await Promise.all([
        allLines.transition().duration(300).attr("opacity", 0.2).end(),
        allPoints.transition().duration(300).attr("opacity", 0.2).end()
    ]);
    
    for (let i = 0; i < n; i++) {
        const category = sequence[i];
        const categoryPoints = allPoints.filter(function() { return d3.select(this).attr('data-id') === category; });
        if(categoryPoints.empty()) continue;

        await categoryPoints.transition().duration(150).attr('opacity', 1).attr('r', 6).end();

        const cx = d3.select(categoryPoints.nodes()[0]).attr('cx');
        g.append('text').attr('class', 'annotation count-label').attr('x', cx).attr('y', -5).attr('text-anchor', 'middle').attr('font-weight', 'bold').attr('fill', hlColor).text(String(i + 1));
        
        await delay(300);

        if (i < n - 1) {
            await categoryPoints.transition().duration(150).attr('opacity', 0.2).attr('r', 3.5).end();
        }
    }

    await g.selectAll('.count-label').transition().duration(300).attr('opacity', 0).remove().end();
    
    const finalPoints = allPoints.filter(function() { return d3.select(this).attr('data-id') === pickedCategory; });
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(data.map(d => d.group));

    finalPoints.each(function() {
        const point = d3.select(this);
        const datum = point.datum();
        const cx = +point.attr("cx");
        const cy = +point.attr("cy");
        const color = colorScale(datum[colorField]);
        const value = datum.value || datum[yField];

        g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4").transition().duration(500).attr("y2", plot.h);
        g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4").transition().duration(500).attr("x2", 0);
        g.append("text").attr("class", "annotation").attr("x", cx + 8).attr("y", cy).attr("dominant-baseline", "middle").attr("fill", color).attr("font-weight", "bold").attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke").text(value.toLocaleString()).attr("opacity", 0).transition().duration(400).delay(200).attr("opacity", 1);
    });

    svg.append('text').attr('class', 'annotation').attr('x', margins.left).attr('y', margins.top - 10).attr('font-size', 14).attr('font-weight', 'bold').attr('fill', hlColor).text(`Nth (from ${from}): ${n} (${pickedCategory})`);

    return resultData;
}

/**
 * 두 데이터 포인트를 비교하여 결과를 시각화합니다.
 */
export async function multipleLineCompare(chartId, op, data) {
    const { svg, g, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // 1. 데이터 연산
    const datumA = findDatum(data, op.targetA);
    const datumB = findDatum(data, op.targetB);
    
    if (!datumA || !datumB) {
        console.warn("Compare: One or both points not found.", op);
        return new BoolValue("Points not found", false);
    }
    
    const boolOp = {
        targetA: { target: fmtISO(datumA.target), group: datumA.group },
        targetB: { target: fmtISO(datumB.target), group: datumB.group },
        operator: op.operator,
        field: 'value'
    };
    const boolResult = dataCompareBool(data, boolOp);
    const result = boolResult ? boolResult.value : false;

    // 2. 시각화
    const allSeries = Array.from(new Set(data.map(d => d.group)));
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(allSeries);
    const { xScale, yScale } = buildScales(data, plot);

    const valueA = datumA.value;
    const valueB = datumB.value;
    const colorA = colorScale(datumA.group);
    const colorB = colorScale(datumB.group);
    
    g.selectAll("path.series-line").transition().duration(600).attr("opacity", 0.1);
    g.selectAll("circle.datapoint").transition().duration(600).attr("opacity", 0);

    const animateAnnotation = (datum, color) => {
        const cx = xScale(datum.target);
        const cy = yScale(datum.value);
        g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", plot.h).attr("stroke", color).attr("stroke-dasharray", "4 4").style("opacity", 0).transition().duration(700).style("opacity", 1);
        g.append("line").attr("class", "annotation").attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4").style("opacity", 0).transition().duration(700).style("opacity", 1);
        g.append("circle").attr("class", "annotation").attr("cx", cx).attr("cy", cy).attr("r", 0).attr("fill", color).attr("stroke", "white").attr("stroke-width", 2).transition().duration(500).attr("r", 7);
        g.append("text").attr("class", "annotation").attr("x", cx).attr("y", cy - 12).attr("text-anchor", "middle").attr("fill", color).attr("font-weight", "bold").attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke").text(datum.value.toLocaleString()).attr("opacity", 0).transition().duration(400).delay(400).attr("opacity", 1);
    };
    
    animateAnnotation(datumA, colorA);
    animateAnnotation(datumB, colorB);
    
    await delay(800);
    
    const symbol = {'>':' > ','>=':' >= ','<':' < ','<=':' <= ','==':' == ','!=':' != '}[op.operator] || ` ${op.operator} `;
    const summary = `${valueA.toLocaleString()}${symbol}${valueB.toLocaleString()} → ${result}`;
    
    g.append("text").attr("class", "annotation").attr("x", plot.w / 2).attr("y", -10).attr("text-anchor", "middle").attr("font-size", 16).attr("font-weight", "bold").attr("fill", result ? "green" : "red").text(summary);

    return boolResult;
}

/**
 * 데이터의 총합을 계산하여 시각화합니다.
 */
export async function multipleLineSum(chartId, op, data) {
    const { g, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(g.node().ownerSVGElement);

    // 1. 데이터 연산
    const result = dataSum(data, op, xField, yField);
    const sum = result ? result.value : 0;
    
    // 2. 시각화
    g.append("text").attr("class", "annotation")
        .attr("x", 0).attr("y", -10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .text(`Total Sum: ${sum.toLocaleString()}`);

    return result;
}

/**
 * 데이터의 평균을 계산하여 시각화합니다.
 */
export async function multipleLineAverage(chartId, op, data) {
    const { svg, g, xField, yField, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    if (!data || data.length === 0) return null;

    // 1. 데이터 연산
    const result = dataAverage(data, op, xField, yField);
    if (!result) return null;
    const avg = result.value;
    
    // 2. 시각화
    const { yScale } = buildScales(data, plot);
    const yPos = yScale(avg);
    const color = "red";
    
    const line = g.append("line").attr("class", "annotation avg-line").attr("x1", 0).attr("y1", yPos).attr("x2", 0).attr("y2", yPos).attr("stroke", color).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");
    await line.transition().duration(800).attr("x2", plot.w).end();

    g.append("text").attr("class", "annotation avg-label").attr("x", plot.w + 6).attr("y", yPos).attr("dominant-baseline", "middle").attr("fill", color).attr("font-weight", "bold").text(`Avg: ${avg.toLocaleString(undefined, {maximumFractionDigits: 2})}`).attr("opacity", 0).transition().delay(200).duration(400).attr("opacity", 1);

    return result;
}

/**
 * 두 데이터 포인트의 차이를 계산하여 시각화합니다.
 */
export async function multipleLineDiff(chartId, op, data) {
    const { svg, g, xField, yField, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // 1. 데이터 연산
    const datumA = findDatum(data, op.targetA);
    const datumB = findDatum(data, op.targetB);
    
    if (!datumA || !datumB) {
        console.warn("Diff: One or both points not found.", op);
        return null;
    }
    
    const diffOp = {
        targetA: { target: fmtISO(datumA.target), group: datumA.group },
        targetB: { target: fmtISO(datumB.target), group: datumB.group },
        field: 'value'
    };
    const diffResult = dataDiff(data, diffOp, xField, yField);
    if (!diffResult) return null;
    const diff = diffResult.value;

    // 2. 시각화
    const allSeries = Array.from(new Set(data.map(d => d.group)));
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(allSeries);
    const { xScale, yScale } = buildScales(data, plot);

    const valueA = datumA.value;
    const valueB = datumB.value;
    const colorA = colorScale(datumA.group);
    const colorB = colorScale(datumB.group);
    
    g.selectAll("path.series-line").transition().duration(600).attr("opacity", 0.1);
    g.selectAll("circle.datapoint").transition().duration(600).attr("opacity", 0);

    const animateAnnotation = (datum, color) => {
        const cx = xScale(datum.target);
        const cy = yScale(datum.value);
        g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", plot.h).attr("stroke", color).attr("stroke-dasharray", "4 4").style("opacity", 0).transition().duration(700).style("opacity", 1);
        g.append("line").attr("class", "annotation").attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4").style("opacity", 0).transition().duration(700).style("opacity", 1);
        g.append("circle").attr("class", "annotation").attr("cx", cx).attr("cy", cy).attr("r", 0).attr("fill", color).attr("stroke", "white").attr("stroke-width", 2).transition().duration(500).attr("r", 7);
        g.append("text").attr("class", "annotation").attr("x", cx).attr("y", cy - 12).attr("text-anchor", "middle").attr("fill", color).attr("font-weight", "bold").attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke").text(datum.value.toLocaleString()).attr("opacity", 0).transition().duration(400).delay(400).attr("opacity", 1);
    };
    
    animateAnnotation(datumA, colorA);
    animateAnnotation(datumB, colorB);
    
    await delay(800);
    
    const summary = `Difference (Δ): ${Math.abs(diff).toLocaleString(undefined, {maximumFractionDigits: 2})}`;
    
    g.append("text").attr("class", "annotation").attr("x", plot.w / 2).attr("y", -10).attr("text-anchor", "middle").attr("font-size", 16).attr("font-weight", "bold").attr("fill", "#333").text(summary);

    return diffResult;
}

/**
 * 데이터의 개수를 순차적으로 카운팅하며 시각화합니다.
 */
export async function multipleLineCount(chartId, op, data) {
    const { svg, g, xField, yField, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // 1. 데이터 연산
    const result = dataCount(data, op, xField, yField);
    const totalCount = result ? result.value : 0;
    if (totalCount === 0) return result;

    // 2. 시각화
    const allLines = g.selectAll("path.series-line");
    const allPoints = g.selectAll("circle.datapoint");
    const hlColor = '#20c997';

    await Promise.all([
        allLines.transition().duration(200).attr('opacity', 0.2).end(),
        allPoints.transition().duration(200).attr('opacity', 0.3).end()
    ]);

    const pointsInOrder = allPoints.nodes().sort((a, b) => (+a.getAttribute('cx')) - (+b.getAttribute('cx')));

    for (let i = 0; i < totalCount; i++) {
        const node = pointsInOrder[i];
        const point = d3.select(node);
        const cx = +point.attr('cx');
        const cy = +point.attr('cy');
        const color = point.attr('fill');

        await point.transition().duration(100).attr('opacity', 1).attr('r', 6).end();

        g.append('text').attr('class', 'annotation count-label').attr('x', cx).attr('y', cy - 10).attr('text-anchor', 'middle').attr('font-size', 12).attr('font-weight', 'bold').attr('fill', color).attr('stroke', 'white').attr('stroke-width', 3).attr('paint-order', 'stroke').text(String(i + 1));
        await delay(50);
    }

    svg.append('text').attr('class', 'annotation').attr('x', margins.left).attr('y', margins.top - 10).attr('font-size', 14).attr('font-weight', 'bold').attr('fill', hlColor).text(`Count: ${totalCount}`);

    return result;
}
