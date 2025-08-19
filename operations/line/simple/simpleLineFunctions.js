export function getSvgAndSetup(chartId) {
  const svg = d3.select(`#${chartId}`).select("svg");
  const g   = svg.select(".plot-area");
  const xField = svg.attr("data-x-field");
  const yField = svg.attr("data-y-field");
  const margins = { left: +svg.attr("data-m-left"), top: +svg.attr("data-m-top") };
  const plot    = { w: +svg.attr("data-plot-w"), h: +svg.attr("data-plot-h") };
  return { svg, g, xField, yField, margins, plot };
}
export function clearAllAnnotations(svg) {
  svg.selectAll(".annotation").remove();
}
export const delay = (ms) => new Promise(res => setTimeout(res, ms));


function toISO(v) {
  const d = new Date(v);
  return isNaN(+d) ? null : fmtISO(d);
}
function normKey(v) {
  return toISO(v) ?? String(v);
}

function selectMainLine(g) {
  const preferred = g.select("path.series-line.main-line, path.series-line[data-main='true']");
  return preferred.empty() ? g.select("path.series-line") : preferred;
}

function selectMainPoints(g) {
  const p = g.selectAll("circle.main-dp");
  return p.empty() ? g.selectAll("circle.datapoint") : p;
}

export async function prepareForNextOperation(chartId) {
  const { svg, g } = getSvgAndSetup(chartId);

  clearAllAnnotations(svg);

  selectMainPoints(g)
    .filter(function () { return +d3.select(this).attr("r") > 5; })
    .transition().duration(400)
    .attr("r", 6).attr("fill", "#a9a9a9").attr("stroke", "none");

  const baseLine = selectMainLine(g);
  baseLine.transition().duration(400).attr("stroke", "#d3d3d3").attr("opacity", 1);

  await delay(400);
}

const fmtISO = d3.timeFormat("%Y-%m-%d");

function isTemporal(fullData, xField) {
  return Array.isArray(fullData) && fullData.length > 0 && (fullData[0][xField] instanceof Date);
}

function parseDateWithGranularity(v) {
  if (v instanceof Date) return { date: v, granularity: "date" };
  if (typeof v === "number" && String(v).length === 4) return { date: new Date(v, 0, 1), granularity: "year" };
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})$/);
    if (m) return { date: new Date(+m[1], 0, 1), granularity: "year" };
    const d = new Date(v);
    if (!isNaN(+d)) return { date: d, granularity: "date" };
  }
  const d = new Date(v);
  if (!isNaN(+d)) return { date: d, granularity: "date" };
  return { date: null, granularity: null };
}

function toPointIdCandidates(key) {
  const { date } = parseDateWithGranularity(key);
  if (date) return [fmtISO(date), String(date.getFullYear())];
  return [String(key)];
}

function normalizeRange(from, to) {
  const F = parseDateWithGranularity(from);
  const T = parseDateWithGranularity(to);
  let fromD = F.date, toD = T.date;
  if (F.granularity === "year" && fromD) fromD = new Date(fromD.getFullYear(), 0, 1);
  if (T.granularity === "year" && toD)   toD   = new Date(toD.getFullYear(), 11, 31);
  return { fromD, toD, fromLabel: fromD ? fmtISO(fromD) : String(from), toLabel: toD ? fmtISO(toD) : String(to) };
}

export async function simpleLineRetrieveValue(chartId, op, data, fullData) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const hlColor = "#ff6961";

    let targetPoint = d3.select(null);
    const retrieveField = op.field || xField;

    if (retrieveField === yField) {

        const targetValue = String(op.key);
        targetPoint = points.filter(function() {
            return d3.select(this).attr("data-value") === targetValue;
        });
    } else {

        const candidates = toPointIdCandidates(op.key);
        for (const id of candidates) {
            const sel = points.filter(function() { return d3.select(this).attr("data-id") === id; });
            if (!sel.empty()) {
                targetPoint = sel;
                break;
            }
        }
    }

    if (targetPoint.empty()) {
        console.warn("RetrieveValue: target not found for key:", op.key);
        return data;
    }

    baseLine.transition().duration(600).attr("opacity", 0.3);
    await targetPoint.transition().duration(600)
        .attr("opacity", 1).attr("r", 8).attr("fill", hlColor)
        .attr("stroke", "white").attr("stroke-width", 2).end();

    const cx = +targetPoint.attr("cx"), cy = +targetPoint.attr("cy");
    const vLine = svg.append("line").attr("class", "annotation")
        .attr("x1", margins.left + cx).attr("y1", margins.top + cy)
        .attr("x2", margins.left + cx).attr("y2", margins.top + cy)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
    const hLine = svg.append("line").attr("class", "annotation")
        .attr("x1", margins.left + cx).attr("y1", margins.top + cy)
        .attr("x2", margins.left + cx).attr("y2", margins.top + cy)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
        
    await Promise.all([
        vLine.transition().duration(500).attr("y2", margins.top + plot.h).end(),
        hLine.transition().duration(500).attr("x2", margins.left).end()
    ]);


    const labelText = (retrieveField === yField) 
        ? targetPoint.attr("data-id") 
        : Number(targetPoint.attr("data-value")).toLocaleString(); 

    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left + cx + 5).attr("y", margins.top + cy - 5)
        .attr("fill", hlColor).attr("font-weight", "bold")
        .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
        .text(labelText); 

    return data;
}

export async function simpleLineFilter(chartId, op, data, fullData) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const hlColor = "steelblue";

    const filterField = op.field || xField;

    if (filterField === yField) {
        const yMax = d3.max(fullData, d => d[yField]);
        const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
        
        const fromValue = op.from !== undefined ? op.from : -Infinity;
        const toValue = op.to !== undefined ? op.to : Infinity;

        [op.from, op.to].forEach(val => {
            if (val === undefined) return;
            const yPos = yScale(val);
            svg.append("line").attr("class", "annotation threshold-line")
                .attr("x1", margins.left).attr("x2", margins.left + plot.w)
                .attr("y1", margins.top + yPos).attr("y2", margins.top + yPos)
                .attr("stroke", hlColor).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");
        });

        points.each(function(d) {
            const point = d3.select(this);
            const isMatch = d[yField] >= fromValue && d[yField] <= toValue;

            point.transition().duration(800)
                .attr("opacity", isMatch ? 1.0 : 0.2)
                .attr("r", isMatch ? 7 : 4)
                .attr("fill", isMatch ? hlColor : "#ccc");

            if (isMatch) {
                const cx = +point.attr("cx");
                const cy = +point.attr("cy");

                svg.append("line")
                    .attr("class", "annotation value-v-line")
                    .attr("x1", margins.left + cx)
                    .attr("y1", margins.top + cy)
                    .attr("x2", margins.left + cx)
                    .attr("y2", margins.top + plot.h) 
                    .attr("stroke", hlColor)
                    .attr("stroke-width", 1)
                    .attr("stroke-dasharray", "2 2")
                    .attr("opacity", 0)
                    .transition().delay(400) 
                    .duration(400)
                    .attr("opacity", 1);
            }
        });

        
        const labelText = `Filter: ${yField} in [${op.from || '...'} ~ ${op.to || '...'}]`;
        svg.append("text").attr("class", "annotation filter-label")
            .attr("x", margins.left + plot.w / 2).attr("y", margins.top - 10)
            .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", hlColor).text(labelText);
        
        return data.filter(d => d[yField] >= fromValue && d[yField] <= toValue);

    } else {

        const temporal = isTemporal(fullData, xField);
        let fromD, toD, fromLabel, toLabel;
        if (temporal) {
            const r = normalizeRange(op.from, op.to);
            ({ fromD, toD, fromLabel, toLabel } = r);
            if (!fromD || !toD) { console.warn("Filter: invalid from/to", op); return data; }
        }
        const xExtent = temporal ? d3.extent(fullData, d => d[xField]) : null;
        const xScale = temporal
            ? d3.scaleTime().domain(xExtent).range([0, plot.w])
            : d3.scalePoint().domain(fullData.map(d => d[xField])).range([0, plot.w]);

        points.transition().duration(800).attr("opacity", 0);
        await baseLine.transition().duration(800).attr("stroke", "#d3d3d3").end();
        const drawVLine = (d) => {
            const xPos = xScale(d);
            const L = svg.append("line").attr("class", "annotation")
                .attr("x1", margins.left + xPos).attr("y1", margins.top)
                .attr("x2", margins.left + xPos).attr("y2", margins.top)
                .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
            return L.transition().duration(800).attr("y2", margins.top + plot.h).end();
        };
        if (temporal) await Promise.all([drawVLine(fromD), drawVLine(toD)]);
        const clipId = `${chartId}-clip-path`;
        svg.select("defs").remove();
        const defs = svg.append("defs");
        defs.append("clipPath").attr("id", clipId)
            .append("rect")
            .attr("x", temporal ? xScale(fromD) : 0)
            .attr("y", 0)
            .attr("width", temporal ? Math.max(0, xScale(toD) - xScale(fromD)) : plot.w)
            .attr("height", plot.h);
        baseLine.clone(true)
            .attr("class", "annotation highlighted-line")
            .attr("stroke", hlColor).attr("stroke-width", 2.5)
            .attr("clip-path", `url(#${clipId})`)
            .attr("opacity", 0)
            .transition().duration(500).attr("opacity", 1);
        const label = temporal
            ? `Filter Range: ${fromLabel} ~ ${toLabel}`
            : `Filtered by ${xField}`;
        svg.append("text").attr("class", "annotation filter-label")
            .attr("x", margins.left + plot.w / 2).attr("y", margins.top - 10)
            .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", hlColor).text(label);
        if (!temporal) return data;
        return data.filter(d => d[xField] >= fromD && d[xField] <= toD);
    }
}

export async function simpleLineFindExtremum(chartId, op, data, fullData) {
  const { svg, g, yField, margins, plot } = getSvgAndSetup(chartId);
  clearAllAnnotations(svg);

  if (!data || !data.length) return data;

  const baseLine = selectMainLine(g);
  const points   = selectMainPoints(g);
  const hlColor  = "#a65dfb";

  const targetVal = op.type === "min"
    ? d3.min(data, d => d[yField])
    : d3.max(data, d => d[yField]);

  const targetPoint = points.filter(d => d && d[yField] === targetVal);
  if (targetPoint.empty()) return data;

  baseLine.transition().duration(600).attr("opacity", 0.3);
  await targetPoint.transition().duration(600)
    .attr("opacity", 1).attr("r", 8).attr("fill", hlColor)
    .attr("stroke", "white").attr("stroke-width", 2).end();

  const cx = +targetPoint.attr("cx");
  const cy = +targetPoint.attr("cy");

  const v = svg.append("line").attr("class", "annotation")
    .attr("x1", margins.left + cx).attr("y1", margins.top + cy)
    .attr("x2", margins.left + cx).attr("y2", margins.top + cy)
    .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
  const h = svg.append("line").attr("class", "annotation")
    .attr("x1", margins.left + cx).attr("y1", margins.top + cy)
    .attr("x2", margins.left + cx).attr("y2", margins.top + cy)
    .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");

  await Promise.all([
    v.transition().duration(500).attr("y2", margins.top + plot.h).end(),
    h.transition().duration(500).attr("x2", margins.left).end()
  ]);

  const label = `${op.type === "min" ? "Min" : "Max"}: ${targetVal.toLocaleString()}`;
  svg.append("text").attr("class", "annotation")
    .attr("x", margins.left + cx).attr("y", margins.top + cy - 15)
    .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
    .attr("fill", hlColor)
    .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
    .text(label);

  return data;
}

export async function simpleLineDetermineRange(chartId, op, data, fullData) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!data || !data.length) return data;

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const hlColor = "#0d6efd";
    
    const rangeField = op.field || yField;

    if (rangeField === xField) {

        const xExtent = d3.extent(fullData, d => d[xField]);
        const xScale = d3.scaleTime().domain(xExtent).range([0, plot.w]);

        const [minDate, maxDate] = d3.extent(data, d => d[xField]);
        
        const minP = points.filter(d => d && +d[xField] === +minDate);
        const maxP = points.filter(d => d && +d[xField] === +maxDate);

        baseLine.transition().duration(600).attr("opacity", 0.3);
        await Promise.all([
            minP.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", hlColor).end(),
            maxP.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", hlColor).end()
        ]);

        const fmt = d3.timeFormat("%Y-%m-%d");

        const createSet = (pt, label) => {
            const d = pt.datum();
            const cx = +pt.attr("cx");
            const cy = +pt.attr("cy");

            svg.append("line").attr("class", "annotation")
                .attr("x1", margins.left + cx).attr("y1", margins.top + cy)
                .attr("x2", margins.left + cx).attr("y2", margins.top + plot.h)
                .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");

            svg.append("text").attr("class", "annotation")
                .attr("x", margins.left + cx).attr("y", margins.top - 15)
                .attr("text-anchor", "middle").attr("fill", hlColor)
                .attr("font-weight", "bold").attr("font-size", 12)
                .text(`${label}: ${fmt(d[xField])}`);
        };
        
        createSet(minP, "Start");
        createSet(maxP, "End");

        const minCy = +minP.attr("cy");

        if (!isNaN(minCy)) {
            svg.append("line").attr("class", "annotation")
                .attr("x1", margins.left)
                .attr("y1", margins.top + minCy)
                .attr("x2", margins.left)
                .attr("y2", margins.top + minCy)
                .attr("stroke", hlColor)
                .attr("stroke-width", 1.5)
                .attr("stroke-dasharray", "4 4")
                .transition().duration(800)
                .attr("x2", margins.left + plot.w); 
        }

        
    } else {

        const minV = d3.min(data, d => d[yField]);
        const maxV = d3.max(data, d => d[yField]);
        const minP = points.filter(d => d && d[yField] === minV);
        const maxP = points.filter(d => d && d[yField] === maxV);

        baseLine.transition().duration(600).attr("opacity", 0.3);
        await Promise.all([
            minP.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", hlColor).end(),
            maxP.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", hlColor).end()
        ]);

        const createSet = (pt, label, value) => {
            const cx = +pt.attr("cx");
            const cy = +pt.attr("cy");
            const v = svg.append("line").attr("class", "annotation")
                .attr("x1", margins.left + cx).attr("y1", margins.top + cy)
                .attr("x2", margins.left + cx).attr("y2", margins.top + cy)
                .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
            const h = svg.append("line").attr("class", "annotation")
                .attr("x1", margins.left).attr("y1", margins.top + cy)
                .attr("x2", margins.left).attr("y2", margins.top + cy)
                .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
            svg.append("text").attr("class", "annotation")
                .attr("x", margins.left + cx).attr("y", margins.top + cy - 15)
                .attr("text-anchor", "middle").attr("fill", hlColor)
                .attr("font-weight", "bold").attr("font-size", 12)
                .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
                .text(`${label}: ${value.toLocaleString()}`);
            return [
                v.transition().duration(800).attr("y2", margins.top + plot.h).end(),
                h.transition().duration(800).attr("x2", margins.left + plot.w).end()
            ];
        };

        await Promise.all([ ...createSet(minP, "MIN", minV), ...createSet(maxP, "MAX", maxV) ]);

        const rangeText = svg.append("text").attr("class", "annotation")
            .attr("x", margins.left + plot.w - 15).attr("y", margins.top + plot.h / 2)
            .attr("text-anchor", "end").attr("font-size", 14).attr("font-weight", "bold")
            .attr("fill", hlColor).attr("stroke", "white").attr("stroke-width", 4)
            .attr("paint-order", "stroke");
        rangeText.append("tspan").attr("x", margins.left + plot.w - 15).attr("dy", "-0.6em").text("값 범위:");
        rangeText.append("tspan").attr("x", margins.left + plot.w - 15).attr("dy", "1.2em")
            .text(`${minV.toLocaleString()} ~ ${maxV.toLocaleString()}`);
        await rangeText.transition().duration(400).attr("opacity", 1).end();
    }
    
    return data;
}


export async function simpleLineCompare(chartId, op, data, fullData) {
  const { svg, g, margins, plot } = getSvgAndSetup(chartId);
  clearAllAnnotations(svg);

  const baseLine = selectMainLine(g);
  const points   = selectMainPoints(g);
  const leftColor  = "#ffb74d";
  const rightColor = "#64b5f6";

  const leftCandidates  = toPointIdCandidates(op.left);
  const rightCandidates = toPointIdCandidates(op.right);

  const pick = (cands) => {
    for (const id of cands) {
      const sel = points.filter(function(){ return d3.select(this).attr("data-id") === id; });
      if (!sel.empty()) return sel;
    }
    return d3.select(null);
  };

  const leftPoint  = pick(leftCandidates);
  const rightPoint = pick(rightCandidates);
  if (leftPoint.empty() || rightPoint.empty()) {
    console.warn("Compare: One or both points not found.", op.left, op.right);
    return data;
  }

  const lv = +leftPoint.attr("data-value");
  const rv = +rightPoint.attr("data-value");

  baseLine.transition().duration(600).attr("opacity", 0.3);
  await Promise.all([
    leftPoint.transition().duration(600).attr("opacity",1).attr("r",8).attr("fill",leftColor).end(),
    rightPoint.transition().duration(600).attr("opacity",1).attr("r",8).attr("fill",rightColor).end()
  ]);

  const annotate = (pt, color, below=false) => {
    const cx=+pt.attr("cx"), cy=+pt.attr("cy");
    const h=svg.append("line").attr("class","annotation")
      .attr("x1",margins.left).attr("y1",margins.top+cy)
      .attr("x2",margins.left).attr("y2",margins.top+cy)
      .attr("stroke",color).attr("stroke-dasharray","4 4");
    const v=svg.append("line").attr("class","annotation")
      .attr("x1",margins.left+cx).attr("y1",margins.top+cy)
      .attr("x2",margins.left+cx).attr("y2",margins.top+cy)
      .attr("stroke",color).attr("stroke-dasharray","4 4");
    svg.append("text").attr("class","annotation")
      .attr("x",margins.left+cx).attr("y",margins.top+cy+(below?16:-8))
      .attr("text-anchor","middle").attr("fill",color)
      .attr("font-weight","bold").attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
      .text((+pt.attr("data-value")).toLocaleString())
      .attr("opacity",0).transition().delay(200).duration(400).attr("opacity",1);
    return [
      h.transition().duration(500).attr("x2",margins.left+cx).end(),
      v.transition().duration(500).attr("y2",margins.top+plot.h).end()
    ];
  };

  await Promise.all([
    ...annotate(leftPoint, leftColor, false),
    ...annotate(rightPoint, rightColor, true)
  ]);

  const diff = Math.abs(lv - rv);
  const leftLabel  = op.left;
  const rightLabel = op.right;
  let result = "";
  if (lv > rv)      result = `${leftLabel}이(가) ${rightLabel}보다 ${diff.toLocaleString()} 더 큽니다.`;
  else if (rv > lv) result = `${rightLabel}이(가) ${leftLabel}보다 ${diff.toLocaleString()} 더 큽니다.`;
  else              result = `${leftLabel}와(과) ${rightLabel}의 값이 ${lv.toLocaleString()}으로 동일합니다.`;

  svg.append("text").attr("class","annotation")
    .attr("x",margins.left+plot.w/2).attr("y",margins.top-10)
    .attr("text-anchor","middle").attr("font-size",16).attr("font-weight","bold")
    .attr("fill","#333").text(result);

  return data;
}


export async function simpleLineSort(chartId, op, data, fullData) {
  const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
  clearAllAnnotations(svg);

  const baseLine = selectMainLine(g);
  const points   = selectMainPoints(g);

  const sorted = [...data].sort((a, b) =>
    op.order === "ascending" ? a[yField] - b[yField] : b[yField] - a[yField]
  );

  const xNew = d3.scalePoint()
    .domain(d3.range(sorted.length))
    .range([0, plot.w]);

  const yScale = d3.scaleLinear()
    .domain(d3.extent(data, d => d[yField])).nice()
    .range([plot.h, 0]);

  const lineGen = d3.line()
    .x((d, i) => xNew(i))
    .y(d => yScale(d[yField]));

  await g.select(".x-axis").transition().duration(1200)
    .call(d3.axisBottom(xNew).tickFormat(() => "")) 
    .end();

  await points.data(sorted, d => d[xField])
    .transition().duration(1200)
    .attr("cx", (d, i) => xNew(i))
    .attr("cy", d => yScale(d[yField]))
    .end();

  await baseLine.datum(sorted)
    .transition().duration(1200)
    .attr("d", lineGen)
    .end();

  return sorted;
}
