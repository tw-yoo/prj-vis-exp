import { DatumValue, BoolValue, IntervalValue } from "../../../object/valueType.js";
import { chartDataStore } from "./multiLineUtil.js";
// ---------- 헬퍼(Helper) 함수들 ----------

const fmtISO = d3.timeFormat("%Y-%m-%d");

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

function clearAllAnnotations(svg) {
    svg.selectAll(".annotation").remove();
}

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const cmpMap = { ">":(a,b)=>a>b, ">=":(a,b)=>a>=b, "<":(a,b)=>a<b, "<=":(a,b)=>a<=b, "==":(a,b)=>a==b, "eq":(a,b)=>a==b, "!=":(a,b)=>a!=b };

function parseDate(v) {
    if (v instanceof Date) return v;
    const d = new Date(v);
    if (!isNaN(+d)) return d;
    if (typeof v === "string" && /^\d{4}$/.test(v)) return new Date(+v, 0, 1);
    return null;
}

function toPointIdCandidates(key) {
    const date = parseDate(key);
    if (date) return [fmtISO(date), String(key)];
    return [String(key)];
}

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

async function animateToSimpleLine(chartId, seriesKey, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    
    // [수정] chartDataStore 참조를 제거하고, data로부터 colorScale을 직접 생성합니다.
    const allSeries = Array.from(new Set(data.map(d => d.group)));
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(allSeries);
    const highlightColor = colorScale(seriesKey);

    const allLines = g.selectAll("path.series-line");
    const targetLine = allLines.filter(d => d.key === seriesKey);
    const otherLines = allLines.filter(d => d.key !== seriesKey);
    
    if (targetLine.empty()) {
        console.warn(`Series with key '${seriesKey}' not found.`);
        return data.filter(d => d.group === seriesKey);
    }

    await Promise.all([
        otherLines.transition().duration(800).attr("opacity", 0).remove().end(),
        targetLine.transition().duration(800).attr("stroke-width", 3.5).end(),
        svg.select(".legend").transition().duration(800).attr("opacity", 0).remove().end()
    ]).catch(err => {});
    
    const filteredData = data.filter(d => d.group === seriesKey);
    const { xScale, yScale } = buildScales(filteredData, plot);

    await Promise.all([
        targetLine.transition().duration(1000).attr("d", d3.line()
            .x(d => xScale(d.target))
            .y(d => yScale(d.value))
            (filteredData)
        ).end(),
        g.select(".y-axis").transition().duration(1000).call(d3.axisLeft(yScale)).end(),
        g.select(".x-axis").transition().duration(1000).call(d3.axisBottom(xScale)).end()
    ]).catch(err => {});

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
        .text(`Filtered to: ${seriesKey}`);
}
// multiLineFunctions.js 파일의 다른 함수들 옆에 추가해주세요.

export async function multipleLineChangeToSimple(chartId, op, data) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    const chartInfo = chartDataStore[chartId];
    if (!chartInfo) return data;

    const { colorScale } = chartInfo;
    const targetSeriesKey = op.group;

    if (!targetSeriesKey) {
        console.warn("ChangeToSimple requires a 'group' property in the spec.");
        return data;
    }

    const allLines = g.selectAll("path.series-line");
    const targetLine = allLines.filter(d => d.key === targetSeriesKey);
    const otherLines = allLines.filter(d => d.key !== targetSeriesKey);
    const highlightColor = colorScale(targetSeriesKey);

    if (targetLine.empty()) {
        console.warn(`Series with key '${targetSeriesKey}' not found.`);
        return data;
    }
    
    // 애니메이션 실행
    const animationPromises = [];
    animationPromises.push(
        otherLines.transition().duration(800).attr("opacity", 0.1).end()
    );
    animationPromises.push(
        targetLine.transition().duration(800)
            .attr("stroke-width", 3.5)
            .attr("opacity", 1)
            .end()
    );
    animationPromises.push(
        svg.select(".legend").transition().duration(800).attr("opacity", 0).remove().end()
    );

    await Promise.all(animationPromises).catch(err => console.log("Animation interrupted."));

    // 데이터 포인트(원)들을 타겟 라인에만 표시
    const filteredData = data.filter(d => d.group === targetSeriesKey);
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



// ---------- 오퍼레이션 함수들 ----------

export async function multipleLineRetrieveValue(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const targetKey = op.target;
    if (targetKey == null) {
        console.warn("RetrieveValue: target key is missing.");
        return [];
    }

    const targetDateStr = toPointIdCandidates(targetKey)[0];
    const targetDatums = data.filter(d => {
        const d_str = d.target instanceof Date ? fmtISO(d.target) : String(d.target);
        return d_str === targetDateStr;
    });

    if (targetDatums.length === 0) {
        console.warn(`RetrieveValue: no data found for target: ${targetKey}`);
        return [];
    }

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

export async function multipleLineFilter(chartId, op, data) {
    const { svg, g, xField, yField, colorField, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const { xScale: originalXScale, yScale: originalYScale } = buildScales(data, plot);
    const allLines = g.selectAll("path.series-line");
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(data.map(d => d.group));

    const { field, operator, value } = op;
    const satisfy = cmpMap[operator];
    
    let filteredData = data;
    if (field === colorField) {
        const valueSet = new Set(Array.isArray(value) ? value : [value]);
        filteredData = data.filter(d => valueSet.has(d.group));
    } else if (field === xField && operator === 'between' && Array.isArray(value)) {
        const [startDate, endDate] = value.map(d => parseDate(d));
        if (startDate && endDate) {
            filteredData = data.filter(d => d.target >= startDate && d.target <= endDate);
        }
    } else if (field === yField && satisfy) {
        filteredData = data.filter(d => satisfy(d.value, value));
    }
    
    if (field === yField && satisfy) {
        const yPos = originalYScale(value);
        g.append("line").attr("class", "annotation")
            .attr("x1", 0).attr("y1", yPos).attr("x2", plot.w).attr("y2", yPos)
            .attr("stroke", "red").attr("stroke-width", 2).attr("stroke-dasharray", "6 4");
    } else if (field === xField && operator === 'between' && Array.isArray(value)) {
        const [startDate, endDate] = value.map(d => parseDate(d));
        if(startDate && endDate) {
            const xStart = originalXScale(startDate);
            const xEnd = originalXScale(endDate);
            g.append("line").attr("class", "annotation").attr("x1", xStart).attr("y1", 0).attr("x2", xStart).attr("y2", plot.h).attr("stroke", "steelblue").attr("stroke-width", 2).attr("stroke-dasharray", "4 4");
            g.append("line").attr("class", "annotation").attr("x1", xEnd).attr("y1", 0).attr("x2", xEnd).attr("y2", plot.h).attr("stroke", "steelblue").attr("stroke-width", 2).attr("stroke-dasharray", "4 4");
        }
    }
    
    await delay(800);
    
    if (filteredData.length === 0) {
        await g.selectAll(".annotation, path.series-line, circle.datapoint").transition().duration(500).attr("opacity", 0).remove().end();
        return [];
    }
    
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
    
    g.selectAll("path.series-line").remove();
    g.selectAll(".highlight-line").attr("class", "series-line");
    
    const getDatumKey = d => `${d.target.toISOString()}|${d.group}`;
    g.selectAll("circle.datapoint")
        .data(filteredData, getDatumKey)
        .join("circle")
        .attr("class", "datapoint")
        .attr("r", 3.5)
        .attr("fill", d => colorScale(d.group))
        .attr("cx", d => newXScale(d.target))
        .attr("cy", d => newYScale(d.value))
        .attr("opacity", 0) // <--- 이 부분을 1에서 0으로 수정했습니다.
        .attr("data-id", d => d.target instanceof Date ? fmtISO(d.target) : String(d.target))
        .attr("data-value", d => d.value)
        .attr("data-series", d => String(d.group));
        
    return filteredData;
}

export async function multipleLineFindExtremum(chartId, op, data) {
    const { svg, g, xField, yField, colorField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!data || data.length === 0) return null;
    
    const allPoints = g.selectAll("circle.datapoint");
    if (allPoints.empty()) return null;

    const hlColor = "#a65dfb";
    const which = op.which || 'max';
    const extremumValue = which === 'min' 
        ? d3.min(data, d => d.value) 
        : d3.max(data, d => d.value);

    if (extremumValue === undefined) {
        return null;
    }

    const findPointsByValue = (v) => {
        return allPoints.filter(function() {
            const datum = d3.select(this).datum();
            return datum && +datum[yField] === +v;
        });
    };
    const extremumPts = findPointsByValue(extremumValue);
    
    if (!extremumPts.empty()) {
        extremumPts.transition().duration(800)
            .attr("opacity", 1)
            .attr("r", 8)
            .attr("fill", hlColor)
            .attr("stroke", "white")
            .attr("stroke-width", 2);
    }

    const { xScale, yScale } = buildScales(data, plot);
    const fmtDate = d3.timeFormat("%Y-%m-%d");

    extremumPts.each(function() {
        const point = d3.select(this);
        const datum = point.datum();
        const cx = +point.attr("cx");
        const cy = +point.attr("cy");

        g.append("line").attr("class", "annotation")
            .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy)
            .attr("stroke", hlColor).attr("stroke-dasharray", "4 4")
            .transition().duration(700).delay(200)
            .attr("y2", plot.h);

        g.append("line").attr("class", "annotation")
            .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy)
            .attr("stroke", hlColor).attr("stroke-dasharray", "4 4")
            .transition().duration(700).delay(200)
            .attr("x2", 0);

        const valueText = `${which.charAt(0).toUpperCase() + which.slice(1)}: ${extremumValue.toLocaleString()}`;
        const dateText = `(${fmtDate(datum[xField])})`;

        const textLabel = g.append("text").attr("class", "annotation")
            .attr("x", cx).attr("y", cy - 20)
            .attr("text-anchor", "middle").attr("fill", hlColor).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke");
        
        textLabel.append("tspan")
            .attr("x", cx).attr("dy", "0em")
            .text(valueText);
            
        textLabel.append("tspan")
            .attr("x", cx).attr("dy", "1.2em")
            .text(dateText);
    });

    const targetDatum = data.find(d => d.value === extremumValue);
    return targetDatum || null;
}



export async function multipleLineDetermineRange(chartId, op, data) {
    const { svg, g, xField, yField, colorField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        return null;
    }

    const allPoints = g.selectAll("circle.datapoint");
    if (allPoints.empty()) {
        return null;
    }
    
    const hlColor = "#0d6efd";
    const values = data.map(d => d.value);
    const minV = d3.min(values);
    const maxV = d3.max(values);

    if (minV === undefined || maxV === undefined) {
        return null;
    }

    const findPointsByValue = (v) => {
        return allPoints.filter(function() {
            const datum = d3.select(this).datum();
            return datum && +datum[yField] === +v;
        });
    };

    const minPts = findPointsByValue(minV);
    const maxPts = findPointsByValue(maxV);

    const highlightTransition = (selection) => {
        if (!selection.empty()) {
            selection.transition().duration(800)
                .attr("opacity", 1)
                .attr("r", 8)
                .attr("fill", hlColor)
                .attr("stroke", "white")
                .attr("stroke-width", 2);
        }
    };
    highlightTransition(minPts);
    highlightTransition(maxPts);
    
    const annotateValuePoints = (value, label, pointsSelection) => {
        if (value === undefined || pointsSelection.empty()) return;
        
        const { yScale } = buildScales(data, plot);
        const yPos = yScale(value);

        g.append("line").attr("class", "annotation")
            .attr("x1", 0).attr("y1", yPos)
            .attr("x2", 0).attr("y2", yPos)
            .attr("stroke", hlColor)
            .attr("stroke-dasharray", "4 4")
            .transition().duration(1000)
            .attr("x2", plot.w);

        pointsSelection.each(function() {
            const point = d3.select(this);
            const cx = +point.attr("cx");
            const cy = +point.attr("cy");

            g.append("text").attr("class", "annotation")
                .attr("x", cx)
                .attr("y", cy - 15)
                .attr("text-anchor", "middle")
                .attr("fill", hlColor)
                .attr("font-weight", "bold")
                .attr("stroke", "white")
                .attr("stroke-width", 3.5)
                .attr("paint-order", "stroke")
                .text(`${label}: ${value.toLocaleString()}`);
        });
    };
    
    await delay(200);
    
    annotateValuePoints(minV, "Min", minPts);
    annotateValuePoints(maxV, "Max", maxPts);

    const summaryText = `Range: ${minV.toLocaleString()} ~ ${maxV.toLocaleString()}`;
    svg.append("text")
        .attr("class", "annotation")
        .attr("x", margins.left)
        .attr("y", margins.top - 12)
        .attr("font-size", 16)
        .attr("font-weight", "bold")
        .attr("fill", hlColor)
        .attr("stroke", "white")
        .attr("stroke-width", 4)
        .attr("paint-order", "stroke")
        .attr("opacity", 0)
        .text(summaryText)
        .transition().duration(500).delay(500)
        .attr("opacity", 1);

    return new IntervalValue(yField, minV, maxV);
}



export async function multipleLineCompare(chartId, op, data) {
    const { svg, g, plot, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const findDatum = (targetSpec) => {
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

    const datumA = findDatum(op.targetA);
    const datumB = findDatum(op.targetB);
    
    if (!datumA || !datumB) {
        console.warn("Compare: One or both points not found.", op);
        return new BoolValue("Points not found", false);
    }

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
        const promises = [];

        const vLine = g.append("line").attr("class", "annotation")
            .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy)
            .attr("stroke", color).attr("stroke-dasharray", "4 4");
        promises.push(vLine.transition().duration(700).delay(200).attr("y2", plot.h).end());

        const hLine = g.append("line").attr("class", "annotation")
            .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy)
            .attr("stroke", color).attr("stroke-dasharray", "4 4");
        promises.push(hLine.transition().duration(700).delay(200).attr("x2", 0).end());

        const circle = g.append("circle").attr("class", "annotation")
            .attr("cx", cx).attr("cy", cy).attr("r", 0)
            .attr("fill", color).attr("stroke", "white").attr("stroke-width", 2);
        promises.push(circle.transition().duration(500).attr("r", 7).end());
        
        const text = g.append("text").attr("class", "annotation")
            .attr("x", cx).attr("y", cy - 12)
            .attr("text-anchor", "middle").attr("fill", color).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke")
            .text(datum.value.toLocaleString())
            .attr("opacity", 0);
        promises.push(text.transition().duration(400).delay(400).attr("opacity", 1).end());

        return Promise.all(promises);
    };
    
    await Promise.all([
        animateAnnotation(datumA, colorA),
        animateAnnotation(datumB, colorB)
    ]).catch(err => {});
    
    const comparisonFunc = cmpMap[op.operator] || (() => false);
    const result = comparisonFunc(valueA, valueB);
    const symbol = {'>':' > ','>=':' >= ','<':' < ','<=':' <= ','==':' == ','!=':' != '}[op.operator] || ` ${op.operator} `;
    const summary = `${valueA.toLocaleString()}${symbol}${valueB.toLocaleString()} → ${result}`;
    
    g.append("text").attr("class", "annotation")
        .attr("x", plot.w / 2).attr("y", -10)
        .attr("text-anchor", "middle").attr("font-size", 16).attr("font-weight", "bold")
        .attr("fill", result ? "green" : "red").text(summary);

    return new BoolValue('', result);
}

export async function multipleLineSum(chartId, op, data) {
    const { g, xField, yField, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const sum = d3.sum(data, d => d.value);

    g.append("text").attr("class", "annotation")
        .attr("x", 0).attr("y", -10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .text(`Total Sum: ${sum.toLocaleString()}`);

    return new DatumValue(xField, yField, 'Sum', null, sum, null);
}

export async function multipleLineAverage(chartId, op, data) {
    const { svg, g, xField, yField, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    if (!data || data.length === 0) return null;

    const avg = d3.mean(data, d => d.value);
    if (!Number.isFinite(avg)) return null;

    const { yScale } = buildScales(data, plot);
    const yPos = yScale(avg);
    const color = "red";
    
    // 이전에 라인을 흐리게 만들던 코드를 삭제했습니다.

    const line = g.append("line")
        .attr("class", "annotation avg-line")
        .attr("x1", 0).attr("y1", yPos)
        .attr("x2", 0).attr("y2", yPos)
        .attr("stroke", color).attr("stroke-width", 2)
        .attr("stroke-dasharray", "5 5");

    await line.transition().duration(800).attr("x2", plot.w).end();

    g.append("text").attr("class", "annotation avg-label")
        .attr("x", plot.w + 6).attr("y", yPos)
        .attr("dominant-baseline", "middle")
        .attr("fill", color).attr("font-weight", "bold")
        .text(`Avg: ${avg.toLocaleString(undefined, {maximumFractionDigits: 2})}`)
        .attr("opacity", 0)
        .transition().delay(200).duration(400)
        .attr("opacity", 1);

    return new DatumValue(xField, yField, 'Average', null, avg, null);
}

export async function multipleLineDiff(chartId, op, data) {
    const { svg, g, xField, yField, plot, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const findDatum = (targetSpec) => {
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

    const datumA = findDatum(op.targetA);
    const datumB = findDatum(op.targetB);
    
    if (!datumA || !datumB) {
        console.warn("Diff: One or both points not found.", op);
        return null;
    }

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
        const promises = [];

        const vLine = g.append("line").attr("class", "annotation")
            .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy)
            .attr("stroke", color).attr("stroke-dasharray", "4 4");
        promises.push(vLine.transition().duration(700).delay(200).attr("y2", plot.h).end());

        const hLine = g.append("line").attr("class", "annotation")
            .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy)
            .attr("stroke", color).attr("stroke-dasharray", "4 4");
        promises.push(hLine.transition().duration(700).delay(200).attr("x2", 0).end());

        const circle = g.append("circle").attr("class", "annotation")
            .attr("cx", cx).attr("cy", cy).attr("r", 0)
            .attr("fill", color).attr("stroke", "white").attr("stroke-width", 2);
        promises.push(circle.transition().duration(500).attr("r", 7).end());
        
        const text = g.append("text").attr("class", "annotation")
            .attr("x", cx).attr("y", cy - 12)
            .attr("text-anchor", "middle").attr("fill", color).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke")
            .text(datum.value.toLocaleString())
            .attr("opacity", 0);
        promises.push(text.transition().duration(400).delay(400).attr("opacity", 1).end());

        return Promise.all(promises);
    };
    
    await Promise.all([
        animateAnnotation(datumA, colorA),
        animateAnnotation(datumB, colorB)
    ]).catch(err => {});
    
    const diff = Math.abs(valueA - valueB);
    const summary = `Difference (Δ): ${diff.toLocaleString(undefined, {maximumFractionDigits: 2})}`;
    
    g.append("text").attr("class", "annotation")
        .attr("x", plot.w / 2).attr("y", -10)
        .attr("text-anchor", "middle").attr("font-size", 16).attr("font-weight", "bold")
        .attr("fill", "#333").text(summary);

    return new DatumValue(xField, yField, `Diff`, null, diff, null);
}


export async function multipleLineNth(chartId, op, data) {
    const { svg, g, xField, yField, colorField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) return [];

    const allLines = g.selectAll("path.series-line");
    const allPoints = g.selectAll("circle.datapoint");
    if (allPoints.empty()) return [];

    let n = Number(op?.n ?? 1);
    const from = String(op?.from || 'left').toLowerCase();
    const hlColor = '#20c997';

    const pointsInOrder = allPoints.nodes().sort((a, b) => {
        return (+a.getAttribute('cx')) - (+b.getAttribute('cx'));
    });
    
    const uniqueCategories = [];
    const categorySet = new Set();
    pointsInOrder.forEach(node => {
        const id = d3.select(node).attr('data-id');
        if (!categorySet.has(id)) {
            categorySet.add(id);
            uniqueCategories.push(id);
        }
    });

    const total = uniqueCategories.length;
    if (!Number.isFinite(n) || n <= 0 || n > total) return [];

    const sequence = from === 'right' ? uniqueCategories.slice().reverse() : uniqueCategories;
    const pickedCategory = sequence[n - 1];

    await Promise.all([
        allLines.transition().duration(300).attr("opacity", 0.2).end(),
        allPoints.transition().duration(300).attr("opacity", 0.2).end()
    ]);
    await delay(300);

    for (let i = 0; i < n; i++) {
        const category = sequence[i];
        const categoryPoints = allPoints.filter(function() {
            return d3.select(this).attr('data-id') === category;
        });
        
        await categoryPoints.transition().duration(150).attr('opacity', 1).attr('r', 6).end();

        const cx = d3.select(categoryPoints.nodes()[0]).attr('cx');
        g.append('text')
            .attr('class', 'annotation count-label')
            .attr('x', cx)
            .attr('y', -5)
            .attr('text-anchor', 'middle')
            .attr('font-weight', 'bold')
            .attr('fill', hlColor)
            .text(String(i + 1));
        
        await delay(300);

        if (i < n - 1) {
            await categoryPoints.transition().duration(150).attr('opacity', 0.2).attr('r', 3.5).end();
        }
    }

    await g.selectAll('.count-label').transition().duration(300).attr('opacity', 0).remove().end();
    
    const finalPoints = allPoints.filter(function() {
        return d3.select(this).attr('data-id') === pickedCategory;
    });
    
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(data.map(d => d.group));

    finalPoints.each(function() {
        const point = d3.select(this);
        const datum = point.datum();
        const cx = +point.attr("cx");
        const cy = +point.attr("cy");
        const color = colorScale(datum[colorField]);

        g.append("line").attr("class", "annotation")
            .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", plot.h)
            .attr("stroke", color).attr("stroke-dasharray", "4 4");

        g.append("line").attr("class", "annotation")
            .attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy)
            .attr("stroke", color).attr("stroke-dasharray", "4 4");
        
        g.append("text").attr("class", "annotation")
            .attr("x", cx + 8)
            .attr("y", cy)
            .attr("dominant-baseline", "middle")
            .attr("fill", color).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke")
            .text(datum[yField].toLocaleString());
    });

    svg.append('text').attr('class', 'annotation')
        .attr('x', margins.left).attr('y', margins.top - 10)
        .attr('font-size', 14).attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Nth (from ${from}): ${n} (${pickedCategory})`);

    return data.filter(d => {
        const d_str = d.target instanceof Date ? fmtISO(d.target) : String(d.target);
        return d_str === pickedCategory;
    });
}

export async function multipleLineCount(chartId, op, data) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        return new DatumValue(xField, yField, 'Count', null, 0, null);
    }

    const allLines = g.selectAll("path.series-line");
    const allPoints = g.selectAll("circle.datapoint");
    if (allPoints.empty()) {
        return new DatumValue(xField, yField, 'Count', null, 0, null);
    }

    const hlColor = '#20c997';

    // 1. 모든 라인과 포인트를 흐리게 처리
    await Promise.all([
        allLines.transition().duration(200).attr('opacity', 0.2).end(),
        allPoints.transition().duration(200).attr('opacity', 0.3).end()
    ]);

    // 2. DOM에서 포인트를 가져와 X축 기준으로 정렬
    const pointsInOrder = allPoints.nodes().sort((a, b) => {
        return (+a.getAttribute('cx')) - (+b.getAttribute('cx'));
    });
    const totalCount = pointsInOrder.length;

    // 3. 순서대로 카운팅 애니메이션 실행
    for (let i = 0; i < totalCount; i++) {
        const node = pointsInOrder[i];
        const point = d3.select(node);
        const cx = +point.attr('cx');
        const cy = +point.attr('cy');
        const color = point.attr('fill');

        await point.transition().duration(100)
            .attr('opacity', 1)
            .attr('r', 6)
            .end();

        g.append('text')
            .attr('class', 'annotation count-label')
            .attr('x', cx)
            .attr('y', cy - 10)
            .attr('text-anchor', 'middle')
            .attr('font-size', 12)
            .attr('font-weight', 'bold')
            .attr('fill', color)
            .attr('stroke', 'white')
            .attr('stroke-width', 3)
            .attr('paint-order', 'stroke')
            .text(String(i + 1));

        await delay(50);
    }

    // 4. 최종 카운트 텍스트 표시
    svg.append('text')
        .attr('class', 'annotation')
        .attr('x', margins.left)
        .attr('y', margins.top - 10)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Count: ${totalCount}`);

    return new DatumValue(xField, yField, 'Count', null, totalCount, null);
}