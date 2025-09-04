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

    let filteredData = data;
    const satisfy = cmpMap[op.operator];
    const { field, operator, value } = op;

    if (field === colorField) {
        if (Array.isArray(value)) {
            const valueSet = new Set(value);
            filteredData = data.filter(d => valueSet.has(d.group));
        } else if (satisfy) {
            filteredData = data.filter(d => satisfy(d.group, value));
        }
    } else if (field === xField) {
        if (operator === 'between' && Array.isArray(value)) {
            const [startDate, endDate] = value.map(d => parseDate(d));
            if (startDate && endDate) {
                filteredData = data.filter(d => d.target >= startDate && d.target <= endDate);
            }
        } else if (satisfy) {
            const comparisonDate = parseDate(value);
            if (comparisonDate) {
                filteredData = data.filter(d => satisfy(d.target, comparisonDate));
            }
        }
    } else if (field === yField) {
        if (satisfy) {
            filteredData = data.filter(d => satisfy(d.value, value));
        }
    }

    if (field === yField && satisfy) {
        const yPos = originalYScale(value);
        g.append("line").attr("class", "annotation")
            .attr("x1", 0).attr("y1", yPos).attr("x2", plot.w).attr("y2", yPos)
            .attr("stroke", "red").attr("stroke-width", 2).attr("stroke-dasharray", "6 4");
    } else if (field === xField && operator === 'between' && Array.isArray(value)) {
        const [startDate, endDate] = value.map(d => parseDate(d));
        if (startDate && endDate) {
            const xStart = originalXScale(startDate);
            const xEnd = originalXScale(endDate);
            g.append("line").attr("class", "annotation").attr("x1", xStart).attr("y1", 0)
                .attr("x2", xStart).attr("y2", plot.h).attr("stroke", "steelblue").attr("stroke-width", 2).attr("stroke-dasharray", "4 4");
            g.append("line").attr("class", "annotation").attr("x1", xEnd).attr("y1", 0)
                .attr("x2", xEnd).attr("y2", plot.h).attr("stroke", "steelblue").attr("stroke-width", 2).attr("stroke-dasharray", "4 4");
        }
    } else if (field === colorField) {
        const keptSeries = new Set(Array.isArray(value) ? value : [value]);
        g.selectAll("path.series-line")
            .filter(d => !keptSeries.has(d.key))
            .transition().duration(800)
            .attr("opacity", 0.1);
    }

    await delay(1200);

    if (!filteredData || filteredData.length === 0) {
        g.selectAll(".annotation").transition().duration(300).attr("opacity", 0).remove();
        await g.selectAll("path.series-line, circle.datapoint").transition().duration(500).attr("opacity", 0).remove().end();
        return [];
    }

    const allLines = g.selectAll("path.series-line");
    const allPoints = g.selectAll("circle.datapoint");
    const getDatumKey = d => {
        if (!d) return null;
        const date = d.target || d[xField];
        const series = d.group || d[colorField];
        if (date instanceof Date) {
            return `${date.toISOString()}|${series}`;
        }
        return null;
    };

    const keptSeriesKeys = new Set(filteredData.map(d => d.group));
    const keptPointKeys = new Set(filteredData.map(getDatumKey));

    const linesToKeep = allLines.filter(d => keptSeriesKeys.has(d.key));
    const pointsToKeep = allPoints.filter(d => keptPointKeys.has(getDatumKey(d)));
    const linesToRemove = allLines.filter(d => !keptSeriesKeys.has(d.key));
    const pointsToRemove = allPoints.filter(d => !keptPointKeys.has(getDatumKey(d)));

    const { xScale: newXScale, yScale: newYScale } = buildScales(filteredData, plot);
    const filteredSeriesMap = new Map(d3.groups(filteredData, d => d.group));
    const newLineGen = d3.line().x(d => newXScale(d.target)).y(d => newYScale(d.value));

    g.selectAll(".annotation").transition().duration(500).attr("opacity", 0).remove();

    await Promise.all([
        g.select(".x-axis").transition().duration(1200).call(d3.axisBottom(newXScale)).end(),
        g.select(".y-axis").transition().duration(1200).call(d3.axisLeft(newYScale)).end(),
        linesToRemove.transition().duration(900).attr("opacity", 0).remove().end(),
        pointsToRemove.transition().duration(900).attr("opacity", 0).remove().end(),
        linesToKeep
            .attr("opacity", 1)
            .transition().duration(1200)
            .attr("d", d => {
                const seriesData = filteredSeriesMap.get(d.key);
                return seriesData ? newLineGen(seriesData) : "";
            })
            .end(),
        pointsToKeep.transition().duration(1200)
            .attr("cx", d => newXScale(d[xField]))
            .attr("cy", d => newYScale(d[yField]))
            .end()
    ]);

    return filteredData;
}


export async function multipleLineFindExtremum(chartId, op, data) {
    const { svg, g, xField, yField, colorField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!data || data.length === 0) return null;

    const which = op.which || 'max';
    const hlColor = "#a65dfb";

    // 1. 데이터에서 최솟/최댓값에 해당하는 DatumValue 찾기
    const extremumValue = which === 'min' ? d3.min(data, d => d.value) : d3.max(data, d => d.value);
    const targetDatum = data.find(d => d.value === extremumValue);

    if (!targetDatum) {
        console.warn("FindExtremum: Could not find target datum for value:", extremumValue);
        return null;
    }

    // 2. 모든 라인과 포인트를 흐리게 처리
    await Promise.all([
        g.selectAll("path.series-line").transition().duration(500).attr("opacity", 0.2).end(),
        g.selectAll("circle.datapoint").transition().duration(500).attr("opacity", 0.2).end()
    ]);

    // 3. 강조할 포인트의 화면 좌표 계산
    const { xScale, yScale } = buildScales(data, plot);
    const cx = xScale(targetDatum.target);
    const cy = yScale(targetDatum.value);
    
    // 4. 해당 포인트만 다시 찾아내어 강조
    const allSeries = Array.from(new Set(data.map(d => d.group)));
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(allSeries);
    const color = colorScale(targetDatum.group);

    // 수직/수평 보조선
    g.append("line").attr("class", "annotation")
        .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", plot.h)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
    g.append("line").attr("class", "annotation")
        .attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");

    // 강조점
    g.append("circle").attr("class", "annotation")
        .attr("cx", cx).attr("cy", cy)
        .attr("r", 0).attr("fill", color).attr("stroke", "white").attr("stroke-width", 2)
        .transition().duration(400)
        .attr("r", 8);

    // 값 텍스트
    g.append("text").attr("class", "annotation")
        .attr("x", cx).attr("y", cy - 15)
        .attr("text-anchor", "middle").attr("fill", color).attr("font-weight", "bold")
        .attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke")
        .text(`${which.charAt(0).toUpperCase() + which.slice(1)}: ${extremumValue.toLocaleString()}`);

    return targetDatum;
}


export async function multipleLineDetermineRange(chartId, op, data) {
    const { svg, g, xField, yField, colorField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        return null;
    }

    const allLines = g.selectAll("path.series-line");
    const allPoints = g.selectAll("circle.datapoint");
    const hlColor = "#0d6efd";

    const values = data.map(d => d.value);
    const minV = d3.min(values);
    const maxV = d3.max(values);

    if (minV === undefined || maxV === undefined) {
        return null;
    }

    const minPointsSet = new Set(data.filter(d => d.value === minV).map(d => `${+d.target}|${d.group}`));
    const maxPointsSet = new Set(data.filter(d => d.value === maxV).map(d => `${+d.target}|${d.group}`));

    await allLines.transition().duration(600).attr("opacity", 0.3).end();
    
    allPoints.transition().duration(600)
        .attr("opacity", function(d) {
            const pointKey = `${+d[xField]}|${d[colorField]}`;
            return minPointsSet.has(pointKey) || maxPointsSet.has(pointKey) ? 1 : 0.1;
        })
        .attr("r", function(d) {
            const pointKey = `${+d[xField]}|${d[colorField]}`;
            return minPointsSet.has(pointKey) || maxPointsSet.has(pointKey) ? 7 : 3.5;
        });

    const { yScale } = buildScales(data, plot);

    const drawHLine = (value, label) => {
        const yPos = yScale(value);
        g.append("line").attr("class", "annotation")
            .attr("x1", 0).attr("y1", yPos)
            .attr("x2", plot.w).attr("y2", yPos)
            .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
            
        g.append("text").attr("class", "annotation")
            .attr("x", -8).attr("y", yPos)
            .attr("text-anchor", "end").attr("dominant-baseline", "middle")
            .attr("fill", hlColor).attr("font-weight", "bold")
            .text(`${label}: ${value.toLocaleString()}`);
    };

    drawHLine(minV, "Min");
    drawHLine(maxV, "Max");

    await delay(800);

    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left).attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", hlColor)
        .text(`Range: ${minV.toLocaleString()} ~ ${maxV.toLocaleString()}`)
        .attr('opacity', 0)
        .transition().duration(400)
        .attr('opacity', 1);

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
    
    // 모든 라인과 포인트를 흐리게 처리
    await g.selectAll("path.series-line, circle.datapoint")
        .transition().duration(500).attr("opacity", 0.15).end();

    // 두 점을 강조하고 보조선 그리기
    const annotate = (datum, color) => {
        const cx = xScale(datum.target);
        const cy = yScale(datum.value);

        // 수직/수평 보조선
        g.append("line").attr("class", "annotation")
            .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", plot.h)
            .attr("stroke", color).attr("stroke-dasharray", "4 4");
        g.append("line").attr("class", "annotation")
            .attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy)
            .attr("stroke", color).attr("stroke-dasharray", "4 4");
            
        // 강조점
        g.append("circle").attr("class", "annotation")
            .attr("cx", cx).attr("cy", cy)
            .attr("r", 7).attr("fill", color).attr("stroke", "white").attr("stroke-width", 2);
            
        // 값 텍스트
        g.append("text").attr("class", "annotation")
            .attr("x", cx).attr("y", cy - 12)
            .attr("text-anchor", "middle").attr("fill", color).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke")
            .text(datum.value.toLocaleString());
    };
    
    annotate(datumA, colorA);
    annotate(datumB, colorB);
    
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
    const diff = Math.abs(valueA - valueB);
    
    const colorA = colorScale(datumA.group);
    const colorB = colorScale(datumB.group);
    
    await g.selectAll("path.series-line, circle.datapoint")
        .transition().duration(500).attr("opacity", 0.15).end();

    const annotate = (datum, color) => {
        const cx = xScale(datum.target);
        const cy = yScale(datum.value);

        // 수직선 애니메이션
        g.append("line").attr("class", "annotation")
            .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy)
            .attr("stroke", color).attr("stroke-dasharray", "4 4")
            .transition().duration(500)
            .attr("y2", plot.h);

        // 수평선 애니메이션
        g.append("line").attr("class", "annotation")
            .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy)
            .attr("stroke", color).attr("stroke-dasharray", "4 4")
            .transition().duration(500)
            .attr("x2", 0);
            
        g.append("circle").attr("class", "annotation")
            .attr("cx", cx).attr("cy", cy)
            .attr("r", 7).attr("fill", color).attr("stroke", "white").attr("stroke-width", 2);
            
        g.append("text").attr("class", "annotation")
            .attr("x", cx).attr("y", cy - 12)
            .attr("text-anchor", "middle").attr("fill", color).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke")
            .text(datum.value.toLocaleString());
    };
    
    annotate(datumA, colorA);
    annotate(datumB, colorB);
    
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

    // 1. 모든 데이터 포인트를 X축 기준으로 정렬
    const pointsInOrder = allPoints.nodes().sort((a, b) => {
        return (+a.getAttribute('cx')) - (+b.getAttribute('cx'));
    });
    
    // 2. 고유한 X축 위치(카테고리) 목록 생성
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

    // 3. N번째 카테고리 결정
    const sequence = from === 'right' ? uniqueCategories.slice().reverse() : uniqueCategories;
    const pickedCategory = sequence[n - 1];

    // 4. 카운팅 애니메이션
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

    // 5. 최종 강조 및 주석
    await g.selectAll('.count-label').transition().duration(300).attr('opacity', 0).remove().end();
    
    const finalPoints = allPoints.filter(d => d[xField] instanceof Date ? fmtISO(d[xField]) === pickedCategory : d[xField] === pickedCategory);
    const { xScale, yScale } = buildScales(data, plot);
    const cx = xScale(parseDate(pickedCategory));

    g.append("line").attr("class", "annotation")
        .attr("x1", cx).attr("y1", 0).attr("x2", cx).attr("y2", plot.h)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");

    svg.append('text').attr('class', 'annotation')
        .attr('x', margins.left).attr('y', margins.top - 10)
        .attr('font-size', 14).attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Nth (from ${from}): ${n}`);

    // 6. N번째에 해당하는 모든 DatumValue 객체를 배열로 반환
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