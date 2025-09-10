import { DatumValue, BoolValue, IntervalValue } from "../../../object/valueType.js";

// 연산 함수들을 operationFunctions.js에서 가져옵니다.
import {
    retrieveValue as dataRetrieveValue,
    filter as dataFilter,
    findExtremum as dataFindExtremum,
    sum as dataSum,
    average as dataAverage,
    diff as dataDiff,
    nth as dataNth,
    compare as dataCompare,
    compareBool as dataCompareBool,
    count as dataCount
} from "../../operationFunctions.js";

// ---------- 헬퍼(Helper) 함수들 (시각화에 필요) ----------

const fmtISO = d3.timeFormat("%Y-%m-%d");

/**
 * 차트의 SVG와 기본 설정을 가져옵니다.
 * @param {string} chartId - 차트의 ID
 * @returns {object} SVG 요소 및 차트 설정 정보
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
 * 모든 어노테이션을 SVG에서 제거합니다.
 * @param {d3.Selection} svg - d3 SVG selection
 */
function clearAllAnnotations(svg) {
    svg.selectAll(".annotation").remove();
}

/**
 * 지정된 시간(ms)만큼 지연시킵니다.
 * @param {number} ms - 지연 시간 (밀리초)
 * @returns {Promise}
 */
const delay = (ms) => new Promise(res => setTimeout(res, ms));

/**
 * 날짜 형식의 값을 Date 객체로 파싱합니다.
 * @param {*} v - 파싱할 값
 * @returns {Date|null}
 */
function parseDate(v) {
    if (v instanceof Date) return v;
    if (v === null || v === undefined) return null;
    const d = new Date(v);
    if (!isNaN(+d)) return d;
    if (typeof v === "string" && /^\d{4}$/.test(v)) return new Date(+v, 0, 1);
    return null;
}

/**
 * 두 날짜가 연/월/일 기준으로 같은지 확인합니다.
 * @param {Date} date1 
 * @param {Date} date2 
 * @returns {boolean}
 */
function isSameDate(date1, date2) {
    if (!date1 || !date2) return false;
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}


/**
 * 차트의 X, Y축 스케일을 생성합니다.
 * @param {Array<object>} data - 차트 데이터
 * @param {object} plot - 플롯 영역 크기 정보
 * @returns {{xScale: d3.Scale, yScale: d3.Scale}}
 */
function buildScales(data, plot) {
    const xVals = data.map(d => d.target).filter(Boolean);
    const isTemporal = xVals.every(v => v instanceof Date);
    
    const xScale = isTemporal
        ? d3.scaleTime().domain(d3.extent(xVals)).range([0, plot.w])
        : d3.scalePoint().domain([...new Set(xVals.map(String))]).range([0, plot.w]);

    const yValues = data.map(d => d.value).filter(v => Number.isFinite(v));
    const yMax = d3.max(yValues);
    const yMin = d3.min(yValues);
    const yScale = d3.scaleLinear().domain([yMin > 0 ? 0 : yMin, yMax]).nice().range([plot.h, 0]);

    return { xScale, yScale };
}

// ---------- 오퍼레이션 함수들 (연산 + 시각화) ----------

/**
 * 특정 그룹(시리즈)만 선택하여 심플 라인 차트처럼 보이게 변경합니다.
 */
export async function multipleLineChangeToSimple(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    const targetSeriesKey = op.group;

    if (!targetSeriesKey) {
        console.warn("ChangeToSimple requires a 'group' property in the spec.");
        return data;
    }

    const filteredData = dataFilter(data, { field: 'group', operator: '==', value: targetSeriesKey });

    if (filteredData.length === 0) {
        console.warn(`Series with key '${targetSeriesKey}' not found.`);
        return [];
    }
    
    const allSeries = Array.from(new Set(data.map(d => d.group)));
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(allSeries);
    const highlightColor = colorScale(targetSeriesKey);
    
    const allLines = g.selectAll("path.series-line");
    const targetLine = allLines.filter(d => d.key === targetSeriesKey);
    const otherLines = allLines.filter(d => d.key !== targetSeriesKey);

    await Promise.all([
        otherLines.transition().duration(800).attr("opacity", 0.1).end(),
        targetLine.transition().duration(800).attr("stroke-width", 3.5).attr("opacity", 1).end(),
        svg.select(".legend").transition().duration(800).attr("opacity", 0).remove().end()
    ]).catch(err => console.log("Animation interrupted."));

    const { xScale, yScale } = buildScales(filteredData, plot);

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
        .transition().duration(500).delay(300)
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
 * 특정 X축 값에 해당하는 모든 시리즈의 데이터 포인트를 조회하고 시각화합니다.
 */
export async function multipleLineRetrieveValue(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (op.target == null) {
        console.warn("RetrieveValue: target key is missing.");
        return [];
    }
    
    const targetDate = parseDate(op.target);
    if (!targetDate) {
        console.warn(`RetrieveValue: invalid date format for target: ${op.target}`);
        return [];
    }

    const targetDatums = data.filter(d => d.target && isSameDate(d.target, targetDate));

    if (targetDatums.length === 0) {
        console.warn(`RetrieveValue: no data found for target: ${op.target}`);
        return [];
    }

    const { xScale, yScale } = buildScales(data, plot);
    const allSeries = Array.from(new Set(data.map(d => d.group)));
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(allSeries);
    const cx = xScale(targetDatums[0].target);

    await g.selectAll("path.series-line").transition().duration(500)
        .attr("opacity", 0.3).attr("stroke-width", 1.5).end();
    
    g.append("line").attr("class", "annotation")
        .attr("x1", cx).attr("y1", plot.h).attr("x2", cx).attr("y2", 0)
        .attr("stroke", "#333").attr("stroke-dasharray", "4 4");

    targetDatums.forEach(datum => {
        const cy = yScale(datum.value);
        const color = colorScale(datum.group);
        g.append("circle").attr("class", "annotation")
            .attr("cx", cx).attr("cy", cy).attr("r", 0)
            .attr("fill", color).attr("stroke", "white").attr("stroke-width", 2)
            .transition().duration(400).delay(200).attr("r", 6);
        g.append("text").attr("class", "annotation")
            .attr("x", cx + 8).attr("y", cy)
            .attr("dominant-baseline", "middle").attr("fill", color).attr("font-weight", "bold")
            .text(datum.value.toLocaleString())
            .attr("opacity", 0).transition().duration(400).delay(300).attr("opacity", 1);
    });

    return targetDatums;
}

/**
 * 데이터를 필터링하고 필터링 결과를 시각적으로 표현합니다.
 */
export async function multipleLineFilter(chartId, op, data) {
    const { svg, g, xField, yField, colorField, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    
    let correctedOp = { ...op };
    if (op.field === xField) correctedOp.field = 'target';
    if (op.field === yField) correctedOp.field = 'value';
    if (op.field === colorField) correctedOp.field = 'group';
    if (op.operator === '==' && Array.isArray(op.value)) {
        correctedOp.operator = 'in';
    }
    
    let filteredData;
    if (correctedOp.field === 'target' && correctedOp.operator === 'between') {
        const [startVal, endVal] = correctedOp.value;
        const startDate = parseDate(startVal);
        const endDate = parseDate(endVal);
        const afterStart = dataFilter(data, { field: 'target', operator: '>=', value: startDate });
        filteredData = dataFilter(afterStart, { field: 'target', operator: '<=', value: endDate });
    } else {
        filteredData = dataFilter(data, correctedOp);
    }
    
    if (filteredData.length === 0) {
        await g.selectAll(".series-line").transition().duration(500).attr("opacity", 0.1).end();
        return []; // 반환값이 빈 배열이면 util에서 다음으로 넘어가지 않음
    }
    
    const { xScale: newXScale, yScale: newYScale } = buildScales(filteredData, plot);
    const newLineGen = d3.line().x(d => newXScale(d.target)).y(d => newYScale(d.value));
    const filteredSeries = d3.groups(filteredData, d => d.group).map(([key, values]) => ({ key, values }));
    
    const allLines = g.selectAll("path.series-line").data(filteredSeries, d => d.key);

    await Promise.all([
        g.select(".x-axis").transition().duration(1200).call(d3.axisBottom(newXScale)).end(),
        g.select(".y-axis").transition().duration(1200).call(d3.axisLeft(newYScale)).end(),
        allLines.join(
            enter => enter.append("path")
                .attr("class", d => `series-line series-${String(d.key).replace(/\s+/g, '-')}`)
                .attr("fill", "none")
                .attr("stroke", d => g.select(`.series-${String(d.key).replace(/\s+/g, '-')}`).attr('stroke') || 'black')
                .attr("stroke-width", 2)
                .attr("d", d => newLineGen(d.values))
                .attr("opacity", 0)
                .transition().duration(1200)
                .attr("opacity", 1)
                .end(),
            update => update.transition().duration(1200)
                .attr("d", d => newLineGen(d.values))
                .attr("opacity", 1)
                .end(),
            exit => exit.transition().duration(1200)
                .attr("opacity", 0)
                .remove()
                .end()
        )
    ]);

    return filteredData;
}


/**
 * 데이터셋에서 최대/최소값을 찾아 시각화합니다.
 */
export async function multipleLineFindExtremum(chartId, op, data) {
    const { svg, g, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    if (!data || data.length === 0) return null;

    const extremumDatum = dataFindExtremum(data, op);
    if (!extremumDatum) return null;
    const extremumDatums = dataFilter(data, { field: 'value', operator: '==', value: extremumDatum.value });

    const { xScale, yScale } = buildScales(data, plot);
    const seriesColors = d3.scaleOrdinal(d3.schemeCategory10).domain(data.map(d => d.group));

    extremumDatums.forEach(datum => {
        const cx = xScale(datum.target);
        const cy = yScale(datum.value);
        const color = seriesColors(datum.group);
        
        g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4")
            .transition().duration(700).attr("y2", plot.h);
        g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4")
            .transition().duration(700).attr("x2", 0);

        g.append("circle").attr("class", "annotation").attr("cx", cx).attr("cy", cy).attr("r", 0)
            .attr("fill", color).attr("stroke", "white").attr("stroke-width", 2)
            .transition().duration(500).delay(200).attr("r", 7);
        g.append("text").attr("class", "annotation").attr("x", cx).attr("y", cy - 15)
            .attr("text-anchor", "middle").attr("fill", color).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke")
            .text(`${op.which || 'max'}: ${datum.value.toLocaleString()}`);
    });

    return extremumDatums[0] || null;
}

/**
 * 데이터셋의 전체 값 범위를 찾아 시각화합니다.
 */
export async function multipleLineDetermineRange(chartId, op, data) {
    const { svg, g, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    if (!data || data.length === 0) return null;

    const minDatum = dataFindExtremum(data, { which: 'min' });
    const maxDatum = dataFindExtremum(data, { which: 'max' });
    if (!minDatum || !maxDatum) return null;

    const minV = minDatum.value;
    const maxV = maxDatum.value;
    const minDatums = dataFilter(data, { field: 'value', operator: '==', value: minV });
    const maxDatums = dataFilter(data, { field: 'value', operator: '==', value: maxV });
    
    await g.selectAll("path.series-line").transition().duration(600).attr("opacity", 0.2).end();

    const { xScale, yScale } = buildScales(data, plot);
    const seriesColors = d3.scaleOrdinal(d3.schemeCategory10).domain(data.map(d => d.group));
    const hlColor = "#0d6efd";

    const annotateValue = (value, label, datums) => {
        const yPos = yScale(value);
        g.append("line").attr("class", "annotation").attr("x1", 0).attr("y1", yPos).attr("x2", 0).attr("y2", yPos).attr("stroke", hlColor).attr("stroke-dasharray", "4 4")
            .transition().duration(1000).attr("x2", plot.w);
        
        datums.forEach(datum => {
            const cx = xScale(datum.target);
            const color = seriesColors(datum.group);
            g.append("circle").attr("class", "annotation").attr("cx", cx).attr("cy", yPos).attr("r", 7).attr("fill", color).attr("stroke", "white").attr("stroke-width", 2);
        });
        
        g.append("text").attr("class", "annotation").attr("x", 10).attr("y", yPos - 10)
            .attr("fill", hlColor).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke")
            .text(`${label}: ${value.toLocaleString()}`);
    };

    annotateValue(minV, "Min", minDatums);
    annotateValue(maxV, "Max", maxDatums);

    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left).attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold").attr("fill", hlColor)
        .text(`Range: ${minV.toLocaleString()} ~ ${maxV.toLocaleString()}`);

    return new IntervalValue(yField, minV, maxV);
}

/**
 * N번째 데이터를 찾아 시각화합니다.
 */
export async function multipleLineNth(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    if (!data || data.length === 0) return [];
    
    const resultData = dataNth(data, { ...op, groupBy: 'target' });

    if (resultData.length === 0) {
        console.warn('Nth: No data found for the given N');
        return [];
    }
    
    const allLines = g.selectAll("path.series-line");
    const allPoints = g.selectAll("circle.datapoint");
    await Promise.all([
        allLines.transition().duration(300).attr("opacity", 0.2).end(),
        allPoints.transition().duration(300).attr("opacity", 0.2).end()
    ]);
    
    const pickedCategoryDate = resultData[0].target;
    // d3 data() returns the data bound to the selection.
    const finalPoints = allPoints.filter(d => d && d.target instanceof Date && isSameDate(d.target, pickedCategoryDate));

    if (finalPoints.empty()) return resultData;

    await finalPoints.transition().duration(300).attr('opacity', 1).attr('r', 6).end();
    
    const cx = d3.select(finalPoints.nodes()[0]).attr('cx');
    g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", 0).attr("x2", cx).attr("y2", plot.h).attr("stroke", "#333").attr("stroke-dasharray", "4 4");

    svg.append('text').attr('class', 'annotation').attr('x', margins.left).attr('y', margins.top - 10)
        .attr('font-size', 14).attr('font-weight', 'bold').attr('fill', '#20c997')
        .text(`Nth (from ${op.from || 'left'}): ${op.n}`);

    return resultData;
}


/**
 * 두 데이터 포인트를 비교하고 결과를 시각화합니다.
 */
export async function multipleLineCompare(chartId, op, data) {
    const { svg, g, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const targetADate = parseDate(op.targetA.category);
    const targetBDate = parseDate(op.targetB.category);
    
    const datumA = data.find(d => d.target && isSameDate(d.target, targetADate) && d.group === op.targetA.series);
    const datumB = data.find(d => d.target && isSameDate(d.target, targetBDate) && d.group === op.targetB.series);
    
    if (!datumA || !datumB) {
        console.warn("Compare: One or both points not found.", op);
        return new BoolValue("Points not found", false);
    }
    
    const cmpMap = { ">":(a,b)=>a>b, ">=":(a,b)=>a>=b, "<":(a,b)=>a<b, "<=":(a,b)=>a<=b, "==":(a,b)=>a==b, "!=":(a,b)=>a!=b };
    const comparisonFunc = cmpMap[op.operator] || (() => false);
    const result = comparisonFunc(datumA.value, datumB.value);
    
    const { xScale, yScale } = buildScales(data, plot);
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(data.map(d => d.group));
    
    const animateAnnotation = (datum, color) => {
        const cx = xScale(datum.target);
        const cy = yScale(datum.value);
        g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", plot.h).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4");
        g.append("line").attr("class", "annotation").attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4");
        g.append("circle").attr("class", "annotation").attr("cx", cx).attr("cy", cy).attr("r", 7).attr("fill", color).attr("stroke", "white").attr("stroke-width", 2);
        g.append("text").attr("class", "annotation").attr("x", cx).attr("y", cy - 15).attr("text-anchor", "middle").attr("fill", color).attr("font-weight", "bold").text(datum.value.toLocaleString());
    };

    g.selectAll("path.series-line").transition().duration(600).attr("opacity", 0.1);
    animateAnnotation(datumA, colorScale(datumA.group));
    animateAnnotation(datumB, colorScale(datumB.group));

    g.append("text").attr("class", "annotation").attr("x", plot.w / 2).attr("y", -10)
        .attr("text-anchor", "middle").attr("font-size", 16).attr("font-weight", "bold")
        .attr("fill", result ? "green" : "red")
        .text(`${datumA.value.toLocaleString()} ${op.operator} ${datumB.value.toLocaleString()} → ${result}`);

    return new BoolValue('', result);
}

/**
 * 데이터의 합계를 계산하고 표시합니다.
 */
export async function multipleLineSum(chartId, op, data) {
    const { svg, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const result = dataSum(data, op, xField, yField);
    if (!result) return null;
    
    svg.append("text").attr("class", "annotation")
        .attr("x", 0).attr("y", -10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .text(`Total Sum: ${result.value.toLocaleString()}`);

    return result;
}

/**
 * 데이터의 평균을 계산하고 평균선을 시각화합니다.
 */
export async function multipleLineAverage(chartId, op, data) {
    const { svg, g, xField, yField, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    if (!data || data.length === 0) return null;

    const result = dataAverage(data, op, xField, yField);
    if (!result) return null;
    const avg = result.value;

    const { yScale } = buildScales(data, plot);
    const yPos = yScale(avg);
    const color = "red";
    
    const line = g.append("line").attr("class", "annotation avg-line")
        .attr("x1", 0).attr("y1", yPos).attr("x2", 0).attr("y2", yPos)
        .attr("stroke", color).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");
    await line.transition().duration(800).attr("x2", plot.w).end();
    
    g.append("text").attr("class", "annotation avg-label")
        .attr("x", plot.w - 10).attr("y", yPos - 10)
        .attr("text-anchor", "end")
        .attr("fill", color).attr("font-weight", "bold")
        .attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke")
        .text(`Avg: ${avg.toLocaleString(undefined, {maximumFractionDigits: 2})}`);
    
    return new DatumValue(xField, yField, 'Average', null, avg, null);
}

/**
 * 두 데이터 포인트의 차이를 계산하고 시각화합니다.
 */
export async function multipleLineDiff(chartId, op, data) {
    const { svg, g, xField, yField, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const targetADate = parseDate(op.targetA.category);
    const targetBDate = parseDate(op.targetB.category);
    
    const datumA = data.find(d => d.target && isSameDate(d.target, targetADate) && d.group === op.targetA.series);
    const datumB = data.find(d => d.target && isSameDate(d.target, targetBDate) && d.group === op.targetB.series);
    if (!datumA || !datumB) return null;

    const newOp = { ...op, targetA: datumA, targetB: datumB };
    const diffResult = dataDiff(data, newOp, xField, yField);
    if (!diffResult) return null;

    const { xScale, yScale } = buildScales(data, plot);
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(data.map(d => d.group));
    g.selectAll("path.series-line").transition().duration(600).attr("opacity", 0.1);
    
    const animateAnnotation = (datum, color) => {
        const cx = xScale(datum.target);
        const cy = yScale(datum.value);
        g.append("circle").attr("class", "annotation").attr("cx", cx).attr("cy", cy).attr("r", 7).attr("fill", color);
        g.append("text").attr("class", "annotation").attr("x", cx).attr("y", cy - 15).attr("text-anchor", "middle").attr("fill", color).text(datum.value.toLocaleString());
    };
    animateAnnotation(datumA, colorScale(datumA.group));
    animateAnnotation(datumB, colorScale(datumB.group));
    
    g.append("text").attr("class", "annotation")
        .attr("x", plot.w / 2).attr("y", -10).attr("text-anchor", "middle")
        .attr("font-size", 16).attr("font-weight", "bold")
        .text(`Difference (Δ): ${diffResult.value.toLocaleString()}`);

    return diffResult;
}

/**
 * 데이터의 총 개수를 세고 시각화합니다.
 */
export async function multipleLineCount(chartId, op, data) {
    const { svg, g, xField, yField, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    
    const result = dataCount(data, op, xField, yField);
    const totalCount = result ? result.value : 0;
    if (totalCount === 0) return result;

    const allPoints = g.selectAll("circle.datapoint");
    await g.selectAll("path.series-line").transition().duration(200).attr('opacity', 0.2).end();
    
    const pointsInOrder = allPoints.nodes().sort((a, b) => +a.getAttribute('cx') - +b.getAttribute('cx'));
    
    for (let i = 0; i < totalCount; i++) {
        const node = pointsInOrder[i];
        const point = d3.select(node);
        const cx = +point.attr('cx');
        const cy = +point.attr('cy');

        await point.transition().duration(50).attr('r', 6).attr('opacity', 1).end();

        g.append('text')
            .attr('class', 'annotation count-label')
            .attr('x', cx)
            .attr('y', cy - 10)
            .attr('text-anchor', 'middle')
            .attr('font-weight', 'bold')
            .attr('fill', '#333')
            .attr('stroke', 'white')
            .attr('stroke-width', 2)
            .attr('paint-order', 'stroke')
            .text(i + 1);
        
        await delay(50);
    }

    svg.append('text').attr('class', 'annotation')
        .attr('x', margins.left).attr('y', margins.top - 10)
        .attr('font-size', 14).attr('font-weight', 'bold')
        .text(`Count: ${totalCount}`);

    return result;
}
