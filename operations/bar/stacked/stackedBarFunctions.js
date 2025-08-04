export function stackedBarRetrieveValue(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg:last-of-type");
  if (svg.empty()) return chartId;

  /* reset */
  svg.selectAll(".retrieve-rect,.retrieve-label").remove();
  svg.selectAll("g.tick text").attr("fill", "#000").attr("font-weight", null);

  /* params */
  const key           = String(op.key);
  const keyField      = op.keyField      || "month";
  const subgroupKey   = String(op.subgroupKey);
  const subgroupField = op.subgroupField || "weather";

  /* locate rect */
  let targetRect = null;
  svg.selectAll("rect").each(function () {
    const d = d3.select(this).datum();
    if (!d || d.start === undefined) return;
    const catVal = String((keyField in d) ? d[keyField] : d.category);
    const subVal = String((subgroupField in d) ? d[subgroupField] : d.subgroup);
    if (catVal === key && subVal === subgroupKey) targetRect = d3.select(this);
  });
  if (!targetRect) { console.warn("stackedBarRetrieveValue: target not found"); return chartId; }

  /* geometry & value */
  const { x, y, width, height } = targetRect.node().getBBox();
  const value = targetRect.datum().end - targetRect.datum().start;

  /* highlight colours */
  const hl   = "#ffeb3b";
  const halo = "#ffffff";
  const pad  = 2;

  // white halo outline
  svg.append("rect")
     .attr("class", "retrieve-rect")
     .attr("x", x-pad).attr("y", y-pad)
     .attr("width", width+pad*2).attr("height", height+pad*2)
     .attr("fill", "none").attr("stroke", halo).attr("stroke-width", 4)
     .attr("pointer-events", "none")
     .attr("opacity", 0)
     .transition().duration(400).attr("opacity", 1);

  // yellow outline
  svg.append("rect")
     .attr("class", "retrieve-rect")
     .attr("x", x-pad).attr("y", y-pad)
     .attr("width", width+pad*2).attr("height", height+pad*2)
     .attr("fill", "none").attr("stroke", hl).attr("stroke-width", 3)
     .attr("pointer-events", "none")
     .attr("opacity", 0)
     .transition().duration(400).attr("opacity", 1);

  // value label with black stroke
  const horiz = width > height;
  svg.append("text")
     .attr("class", "retrieve-label")
     .attr("x", horiz ? x + width + 6 : x + width / 2)
     .attr("y", horiz ? y + height / 2 : y - 6)
     .attr("fill", hl).attr("font-size", "12px").attr("font-weight", "bold")
     .attr("paint-order", "stroke").attr("stroke", "#000").attr("stroke-width", 3)
     .attr("dominant-baseline", horiz ? "middle" : "auto")
     .attr("text-anchor", horiz ? "start" : "middle")
     .text(value.toLocaleString())
     .attr("opacity", 0)
     .transition().delay(200).duration(400).attr("opacity", 1);

  // x-axis tick highlight
  svg.selectAll("g.tick").each(function (t) {
    if (String(t) === key) {
      d3.select(this).select("text")
        .attr("fill", hl).attr("font-weight", "bold")
        .attr("opacity", 0)
        .transition().delay(200).duration(400).attr("opacity", 1);
    }
  });

  return chartId;
}

// Assumes d3, getOrientation(svg), getMargins(svg) helpers are in scope
export function stackedBarFilter(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg:last-of-type");
  if (svg.empty()) return chartId;

  // 0. Reset
  svg.selectAll(".filter-rect, .filter-label").remove();
  svg.selectAll("g.tick text")
     .attr("fill", "#000")
     .attr("font-weight", null)
     .attr("opacity", 1);
  svg.selectAll("rect")
     .attr("opacity", 1);

  // 1. Params
  const keyValue      = op.key;
  const satisfy       = op.satisfy || ">=";
  const subgroupField = op.subgroupField || null;
  const subgroupKey   = op.subgroupKey != null ? String(op.subgroupKey) : null;

  // 2. Comparator
  const cmp = {
    ">":  (v,k) => v  >  k,
    ">=": (v,k) => v >= k,
    "<":  (v,k) => v  <  k,
    "<=": (v,k) => v <= k,
    "==": (v,k) => v == k,
    "!=": (v,k) => v != k
  }[satisfy] || ((v,k)=>v>=k);

  // 3. Highlight colors
  const hl   = "#ffeb3b";
  const halo = "#ffffff";
  const pad  = 2;

  const orientation = getOrientation(svg);
  const { left: mL, top: mT } = getMargins(svg);

  // 4. Collect categories to highlight
  const highlightCats = new Set();

  // 5. For each rect
  svg.selectAll("rect").each(function(d) {
    if (!d || d.start == null || d.end == null) return;
    const sel = d3.select(this);
    const value = d.end - d.start;

    // subgroup filter
    if (subgroupField && subgroupKey !== null) {
      const subVal = String(d[subgroupField] ?? d.subgroup);
      if (subVal !== subgroupKey) {
        sel.transition().duration(300).attr("opacity", 0.25);
        return;
      }
    }

    // numeric filter
    if (!cmp(value, keyValue)) {
      sel.transition().duration(300).attr("opacity", 0.25);
      return;
    }

    // both passed → highlight
    const bbox = this.getBBox();

    // outlines
    svg.append("rect")
       .attr("class","filter-rect")
       .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
       .attr("width", bbox.width + pad*2)
       .attr("height",bbox.height+ pad*2)
       .attr("fill","none").attr("stroke",halo).attr("stroke-width",4)
       .attr("pointer-events","none").attr("opacity",0)
       .transition().duration(400).attr("opacity",1);

    svg.append("rect")
       .attr("class","filter-rect")
       .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
       .attr("width", bbox.width + pad*2)
       .attr("height",bbox.height+ pad*2)
       .attr("fill","none").attr("stroke",hl).attr("stroke-width",3)
       .attr("pointer-events","none").attr("opacity",0)
       .transition().duration(400).attr("opacity",1);

    // label
    let x, y, anchor, baseline;
    if (orientation === "horizontal") {
      x = bbox.x + bbox.width + 6;
      y = bbox.y + bbox.height/2;
      anchor = "start";
      baseline = "middle";
    } else {
      x = bbox.x + bbox.width/2;
      y = bbox.y - 6;
      anchor = "middle";
      baseline = "auto";
    }

    svg.append("text")
       .attr("class","filter-label")
       .attr("x", x).attr("y", y)
       .attr("fill", hl)
       .attr("font-size","12px")
       .attr("font-weight","bold")
       .attr("stroke","#000").attr("stroke-width",3).attr("paint-order","stroke")
       .attr("text-anchor", anchor)
       .attr("dominant-baseline", baseline)
       .text(value.toLocaleString())
       .attr("opacity",0)
       .transition().delay(200).duration(400).attr("opacity",1);

    highlightCats.add(String(d.category));
  });

  // 6. Axis tick highlight
  svg.selectAll("g.tick").each(function(t) {
    if (highlightCats.has(String(t))) {
      d3.select(this).select("text")
        .attr("fill", hl)
        .attr("font-weight","bold")
        .attr("opacity",0)
        .transition().delay(300).duration(400).attr("opacity",1);
    }
  });

  return chartId;
}

// Assumes d3, getOrientation(svg), getMargins(svg) helpers are in scope
export function stackedBarFindExtremum(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg:last-of-type");
  if (svg.empty()) return chartId;

  // 0) Clear previous highlights
  svg.selectAll(".extremum-rect, .extremum-label").remove();
  svg.selectAll("g.tick text")
     .attr("fill", "#000")
     .attr("font-weight", null)
     .attr("opacity", 1);

  // 1) Parameters
  const subgroupField = op.subgroupField;
  const subgroupKey   = op.subgroupKey != null ? String(op.subgroupKey) : null;
  const type          = (op.type || "max").toLowerCase();

  // 2) Gather only the stacked segments for this subgroup
  const segments = [];
  svg.selectAll("rect").each(function(d) {
    if (!d || d.start == null || d.end == null) return;
    if (subgroupField && subgroupKey !== null) {
      const subVal = String(d[subgroupField] ?? d.subgroup);
      if (subVal !== subgroupKey) return;
    }
    segments.push({ datum: d, node: this, value: d.end - d.start });
  });
  if (!segments.length) return chartId;

  // 3) Compute extremum value
  const extremumValue = type === "min"
    ? d3.min(segments, s => s.value)
    : d3.max(segments, s => s.value);

  // 4) Styling constants
  const pad  = 2;
  const halo = "#ffffff";
  const hl   = "#ffeb3b";

  const orientation = getOrientation(svg);
  const { left: mL, top: mT } = getMargins(svg);

  // 5) Highlight each extremum segment
  segments
    .filter(s => s.value === extremumValue)
    .forEach(s => {
      const bbox = s.node.getBBox();

      // draw white halo
      svg.append("rect")
         .attr("class","extremum-rect")
         .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
         .attr("width",  bbox.width  + pad*2)
         .attr("height", bbox.height + pad*2)
         .attr("fill","none").attr("stroke",halo).attr("stroke-width",4)
         .attr("opacity",0)
         .transition().duration(400).attr("opacity",1);

      // draw yellow outline
      svg.append("rect")
         .attr("class","extremum-rect")
         .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
         .attr("width",  bbox.width  + pad*2)
         .attr("height", bbox.height + pad*2)
         .attr("fill","none").attr("stroke",hl).attr("stroke-width",3)
         .attr("opacity",0)
         .transition().delay(100).duration(400).attr("opacity",1);

      // figure out label position based on chart orientation
      let x, y, anchor, baseline;
      if (orientation === "horizontal") {
        x = bbox.x + bbox.width + 6;
        y = bbox.y + bbox.height / 2;
        anchor = "start";
        baseline = "middle";
      } else {
        x = bbox.x + bbox.width / 2;
        y = bbox.y - 6;
        anchor = "middle";
        baseline = "auto";
      }

      // draw the value label
      svg.append("text")
         .attr("class","extremum-label")
         .attr("x", x).attr("y", y)
         .attr("text-anchor", anchor)
         .attr("dominant-baseline", baseline)
         .attr("fill", hl)
         .attr("font-size","12px")
         .attr("font-weight","bold")
         .attr("paint-order","stroke")
         .attr("stroke","#000")
         .attr("stroke-width",3)
         .text(`${type === "min" ? "MIN" : "MAX"} ${extremumValue.toLocaleString()}`)
         .attr("opacity",0)
         .transition().delay(200).duration(400).attr("opacity",1);
    });

  // 6) Highlight the corresponding axis ticks
  if (orientation === "horizontal") {
    svg.select(".y-axis").selectAll("g.tick").each(function(t) {
      if (t === segments[0].datum.category) {
        d3.select(this).select("text")
          .attr("fill", hl)
          .attr("font-weight","bold")
          .attr("opacity",0)
          .transition().delay(300).duration(400).attr("opacity",1);
      }
    });
  } else {
    svg.select(".x-axis").selectAll("g.tick").each(function(t) {
      if (t === segments[0].datum.category) {
        d3.select(this).select("text")
          .attr("fill", hl)
          .attr("font-weight","bold")
          .attr("opacity",0)
          .transition().delay(300).duration(400).attr("opacity",1);
      }
    });
  }

  return chartId;
}
// Assumes these helpers are in scope:
// function getOrientation(svg) { return svg.attr("data-orientation") || "vertical"; }
// function getMargins(svg)     { return { left: +svg.attr("data-m-left")||0, top: +svg.attr("data-m-top")||0 }; }

export function stackedBarCompare(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg:last-of-type");
  if (svg.empty()) return chartId;

  // 0. clear previous
  svg.selectAll(".compare-rect, .compare-line, .compare-label").remove();
  svg.selectAll("g.tick text")
     .attr("fill", "#000")
     .attr("font-weight", null)
     .attr("opacity", 1);

  // params
  const keyField      = op.keyField      || "Country";
  const subgroupField = op.subgroupField || "opinion";
  const subgroupKey   = op.subgroupKey   != null ? String(op.subgroupKey) : null;
  const leftKey       = String(op.left);
  const rightKey      = String(op.right);
  const operator      = (op.operator || "gt").toLowerCase();

  // find target rects
  let leftRect, rightRect, leftDatum, rightDatum;
  svg.selectAll("rect").each(function(d) {
    if (!d || d.start == null || d.end == null) return;
    const cat = String(d[keyField] ?? d.category);
    const sub = subgroupField && d[subgroupField] != null
                ? String(d[subgroupField])
                : null;
    if (cat === leftKey && (!subgroupKey || subgroupKey === sub))  { leftRect  = d3.select(this); leftDatum  = d; }
    if (cat === rightKey && (!subgroupKey || subgroupKey === sub)) { rightRect = d3.select(this); rightDatum = d; }
  });
  if (!leftRect || !rightRect) {
    console.warn("stackedBarCompare: target not found");
    return chartId;
  }

  // geometry & values
  const lbox = leftRect.node().getBBox();
  const rbox = rightRect.node().getBBox();
  const lval = leftDatum.end  - leftDatum.start;
  const rval = rightDatum.end - rightDatum.start;

  // styles
  const pad  = 2;
  const halo = "#ffffff";
  const hl   = "#ffeb3b";

  const orientation = getOrientation(svg);

  // helper to draw outlines
  [lbox, rbox].forEach(b => {
    svg.append("rect")
       .attr("class","compare-rect")
       .attr("x", b.x - pad).attr("y", b.y - pad)
       .attr("width",  b.width  + pad*2)
       .attr("height", b.height + pad*2)
       .attr("fill","none").attr("stroke",halo).attr("stroke-width",4)
       .attr("opacity",0).transition().duration(400).attr("opacity",1);

    svg.append("rect")
       .attr("class","compare-rect")
       .attr("x", b.x - pad).attr("y", b.y - pad)
       .attr("width",  b.width  + pad*2)
       .attr("height", b.height + pad*2)
       .attr("fill","none").attr("stroke",hl).attr("stroke-width",3)
       .attr("opacity",0).transition().delay(100).duration(400).attr("opacity",1);
  });

  // draw connecting line & labels based on orientation
  if (orientation === "horizontal") {
    // horizontal bars → vertical connector
    const xCenter = Math.min(lbox.x + lbox.width/2, rbox.x + rbox.width/2) - 20;
    const y1 = lbox.y + lbox.height/2;
    const y2 = rbox.y + rbox.height/2;

    svg.append("line")
       .attr("class","compare-line")
       .attr("x1", xCenter).attr("y1", y1)
       .attr("x2", xCenter).attr("y2", y2)
       .attr("stroke", hl).attr("stroke-width", 2)
       .attr("stroke-dasharray", function(){ const L=this.getTotalLength(); return `${L} ${L}`})
       .attr("stroke-dashoffset", function(){ return this.getTotalLength() })
       .transition().duration(600).attr("stroke-dashoffset", 0);

    // value tags to right of each bar
    [[lbox, lval], [rbox, rval]].forEach(([b,val], i) => {
      const x = b.x + b.width + 6;
      const y = b.y + b.height/2;
      svg.append("text")
         .attr("class","compare-label")
         .attr("x", x).attr("y", y)
         .attr("fill", hl).attr("font-size","12px").attr("font-weight","bold")
         .attr("paint-order","stroke").attr("stroke","#000").attr("stroke-width",3)
         .attr("text-anchor","start").attr("dominant-baseline","middle")
         .text(val.toLocaleString())
         .attr("opacity",0)
         .transition().delay(200 + i*100).duration(400).attr("opacity",1);
    });

    // summary between bars
    const midY = (y1 + y2)/2;
    svg.append("text")
       .attr("class","compare-label")
       .attr("x", xCenter - 4).attr("y", midY)
       .attr("text-anchor","end").attr("dominant-baseline","middle")
       .attr("fill", hl).attr("font-size","13px").attr("font-weight","bold")
       .text(`${leftKey} → ${rightKey}`)
       .attr("opacity",0)
       .transition().delay(350).duration(400).attr("opacity",1);

  } else {
    // vertical bars → horizontal connector
    const x1 = lbox.x + lbox.width/2;
    const x2 = rbox.x + rbox.width/2;
    const yMid = Math.min(lbox.y, rbox.y) - 20;

    svg.append("line")
       .attr("class","compare-line")
       .attr("x1", x1).attr("y1", yMid)
       .attr("x2", x2).attr("y2", yMid)
       .attr("stroke", hl).attr("stroke-width", 2)
       .attr("stroke-dasharray", function(){ const L=this.getTotalLength(); return `${L} ${L}`})
       .attr("stroke-dashoffset", function(){ return this.getTotalLength() })
       .transition().duration(600).attr("stroke-dashoffset", 0);

    // value tags above each bar
    [[lbox, lval], [rbox, rval]].forEach(([b,val], i) => {
      const x = b.x + b.width/2;
      const y = b.y - 6;
      svg.append("text")
         .attr("class","compare-label")
         .attr("x", x).attr("y", y)
         .attr("fill", hl).attr("font-size","12px").attr("font-weight","bold")
         .attr("paint-order","stroke").attr("stroke","#000").attr("stroke-width",3)
         .attr("text-anchor","middle")
         .text(val.toLocaleString())
         .attr("opacity",0)
         .transition().delay(200 + i*100).duration(400).attr("opacity",1);
    });

    // summary between bars
    const midX = (x1 + x2)/2;
    svg.append("text")
       .attr("class","compare-label")
       .attr("x", midX).attr("y", yMid - 4)
       .attr("text-anchor","middle")
       .attr("fill", hl).attr("font-size","13px").attr("font-weight","bold")
       .text(`${leftKey} → ${rightKey}`)
       .attr("opacity",0)
       .transition().delay(350).duration(400).attr("opacity",1);
  }

  return chartId;
}

// Assumes d3, getOrientation(svg), getMargins(svg) helpers are in scope
export function stackedBarDetermineRange(chartId, op) {
  const svg = d3.select(`#${chartId} svg:last-of-type`);
  if (svg.empty()) return chartId;

  const subgroupField = op.subgroupField;
  const subgroupKey   = String(op.subgroupKey);
  if (!subgroupField || !subgroupKey) {
    console.warn("subgroupField/subgroupKey required");
    return chartId;
  }

  // dimensions & margins
  const width  = +svg.attr("width");
  const height = +svg.attr("height");
  const margin = { top: 20, right: 30, bottom: 30, left: 50 };

  const orientation = getOrientation(svg);
  const { left: mL, top: mT } = getMargins(svg);

  // 1) collect only the segments for this subgroup
  const segs = [];
  svg.selectAll("rect").each(function(d) {
    if (!d || d.start == null || d.end == null) return;
    const subVal = String(d[subgroupField] ?? d.subgroup);
    if (subVal !== subgroupKey) return;
    segs.push({ node: this, value: d.end - d.start });
  });
  if (!segs.length) {
    console.warn("no segments matched", subgroupKey);
    return chartId;
  }

  // 2) find min/max values and corresponding boxes
  const values = segs.map(s => s.value);
  const minV   = d3.min(values);
  const maxV   = d3.max(values);
  const minSeg = segs.find(s => s.value === minV);
  const maxSeg = segs.find(s => s.value === maxV);
  const minBox = minSeg.node.getBBox();
  const maxBox = maxSeg.node.getBBox();

  const hl   = "#ffeb3b";
  const halo = "#ffffff";
  const pad  = 2;

  if (orientation === "horizontal") {
    // horizontal stacked bars → vertical dashed lines
    const xMin = minBox.x + minBox.width;
    const xMax = maxBox.x + maxBox.width;
    const y0   = mT;
    const y1   = height - margin.bottom;

    // white halo lines
    [xMin, xMax].forEach(x => {
      svg.append("line")
         .attr("class","range-line")
         .attr("x1", x).attr("x2", x)
         .attr("y1", y0).attr("y2", y1)
         .attr("stroke", halo).attr("stroke-width", 4)
         .attr("opacity", 0)
         .transition().duration(400).attr("opacity", 1);

      svg.append("line")
         .attr("class","range-line")
         .attr("x1", x).attr("x2", x)
         .attr("y1", y0).attr("y2", y1)
         .attr("stroke", hl).attr("stroke-width", 2)
         .attr("stroke-dasharray","4 4")
         .attr("opacity", 0)
         .transition().delay(100).duration(400).attr("opacity", 1);
    });

    // horizontal connector at top
    svg.append("line")
       .attr("class","range-line")
       .attr("x1", xMin).attr("x2", xMax)
       .attr("y1", y0 - pad).attr("y2", y0 - pad)
       .attr("stroke", halo).attr("stroke-width", 4)
       .attr("opacity", 0)
       .transition().duration(400).attr("opacity", 1);

    svg.append("line")
       .attr("class","range-line")
       .attr("x1", xMin).attr("x2", xMax)
       .attr("y1", y0 - pad).attr("y2", y0 - pad)
       .attr("stroke", hl).attr("stroke-width", 2)
       .attr("stroke-dasharray","4 4")
       .attr("opacity", 0)
       .transition().delay(100).duration(400).attr("opacity", 1);

    // Δ label above
    svg.append("text")
       .attr("class","delta-label")
       .attr("x", (xMin + xMax) / 2)
       .attr("y", y0 - pad*3)
       .attr("text-anchor","middle")
       .attr("dominant-baseline","baseline")
       .attr("font-size",12)
       .attr("fill",hl)
       .text(`Δ ${ (maxV - minV).toLocaleString() }`);
  } else {
    // vertical stacked bars → horizontal dashed lines
    const yMin = mT + (height - margin.bottom - maxV / d3.max(values) * (height - margin.top - margin.bottom)); 
    // actually map value to pixel: easier to get from box
    const yMinBox = minBox.y + minBox.height;
    const yMaxBox = maxBox.y + maxBox.height;
    const x0 = margin.left;
    const x1 = width - margin.right;

    // white halo lines
    [yMinBox, yMaxBox].forEach(y => {
      svg.append("line")
         .attr("class","range-line")
         .attr("x1", x0).attr("x2", x1)
         .attr("y1", y).attr("y2", y)
         .attr("stroke", halo).attr("stroke-width", 4)
         .attr("opacity", 0)
         .transition().duration(400).attr("opacity", 1);

      svg.append("line")
         .attr("class","range-line")
         .attr("x1", x0).attr("x2", x1)
         .attr("y1", y).attr("y2", y)
         .attr("stroke", hl).attr("stroke-width", 2)
         .attr("stroke-dasharray","4 4")
         .attr("opacity", 0)
         .transition().delay(100).duration(400).attr("opacity", 1);
    });

    // vertical connector at right
    svg.append("line")
       .attr("class","range-line")
       .attr("x1", x1 + pad).attr("x2", x1 + pad)
       .attr("y1", yMaxBox).attr("y2", yMinBox)
       .attr("stroke", halo).attr("stroke-width", 4)
       .attr("opacity", 0)
       .transition().duration(400).attr("opacity", 1);

    svg.append("line")
       .attr("class","range-line")
       .attr("x1", x1 + pad).attr("x2", x1 + pad)
       .attr("y1", yMaxBox).attr("y2", yMinBox)
       .attr("stroke", hl).attr("stroke-width", 2)
       .attr("stroke-dasharray","4 4")
       .attr("opacity", 0)
       .transition().delay(100).duration(400).attr("opacity", 1);

    // Δ label to the right
    svg.append("text")
       .attr("class","delta-label")
       .attr("x", x1 + pad*3)
       .attr("y", (yMaxBox + yMinBox) / 2)
       .attr("text-anchor","start")
       .attr("dominant-baseline","middle")
       .attr("font-size",12)
       .attr("fill",hl)
       .text(`Δ ${ (maxV - minV).toLocaleString() }`);
  }

  return chartId;
}


/* ------------------------------------------------------------------ */
/*   stackedBarSort – animated sort & reflow (bars anchored to x-axis)*/
/* ------------------------------------------------------------------ */
export function stackedBarSort(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg:last-of-type");
  if (svg.empty()) return chartId;

  // 0. parameters
  const order         = (op.order || "ascending").toLowerCase();
  const limit         = op.limit != null ? +op.limit : null;
  const subgroupField = op.subgroupField || null;
  const subgroupKey   = op.subgroupKey   != null
                         ? String(op.subgroupKey)
                         : null;

  // 1. dimensions
  const width  = +svg.attr("width");
  const height = +svg.attr("height");
  const margin = { top: 20, right: 30, bottom: 50, left: 60 };

  // 2. collect only data-bound bars
  const bars = svg.selectAll("rect")
    .filter(d => d && d.start != null && d.end != null);

  // 3. extract segments for later outline
  const segs = [];
  bars.each(function(d) {
    segs.push({
      node:     this,
      category: String(d.category),
      subgroup: String(d[subgroupField] ?? d.subgroup),
      value:    d.end - d.start
    });
  });

  // 4. compute per-category sums (optionally subgroup-only)
  const sums = new Map();
  segs.forEach(s => {
    if (subgroupField && subgroupKey && s.subgroup !== subgroupKey) return;
    sums.set(s.category, (sums.get(s.category) || 0) + s.value);
  });

  // 5. sort categories
  const sortedCats = Array.from(sums.entries())
    .sort((a, b) =>
      order === "ascending" ? a[1] - b[1] : b[1] - a[1]
    )
    .map(([cat]) => cat);

  // 6. new scales
  const xNew = d3.scaleBand()
    .domain(sortedCats)
    .range([margin.left, width - margin.right])
    .padding(0.1);

  const yMax = d3.max(sortedCats.map(c => sums.get(c)));
  const yNew = d3.scaleLinear()
    .domain([0, yMax]).nice()
    .range([height - margin.bottom, margin.top]);

  // 7. fade out non-subgroup bars (0–500ms)
  bars.transition().duration(500)
      .attr("opacity", d => {
        if (subgroupField && subgroupKey) {
          return String(d[subgroupField] ?? d.subgroup) === subgroupKey ? 1 : 0;
        }
        return 1;
      });

  // 8. slide & re-anchor bars (500–1500ms)
  bars.transition().delay(500).duration(1000)
      .attr("x", d => xNew(String(d.category)))
      .attr("width", xNew.bandwidth())
      .attr("y", d => yNew(d.end - d.start))
      .attr("height", d => (height - margin.bottom) - yNew(d.end - d.start));

  // 9. fade out old axes & legend (1500–1800ms)
  svg.selectAll("g")
     .transition().delay(1500).duration(300)
     .attr("opacity", 0)
     .remove();

  // 10. draw new axes (1800–2300ms)
  setTimeout(() => {
    // x-axis
    svg.append("g")
       .attr("class", "sorted-x-axis")
       .attr("transform", `translate(0,${height - margin.bottom})`)
       .attr("opacity", 0)
       .call(d3.axisBottom(xNew))
       .transition().duration(500).attr("opacity", 1);

    // y-axis
    svg.append("g")
       .attr("class", "sorted-y-axis")
       .attr("transform", `translate(${margin.left},0)`)
       .attr("opacity", 0)
       .call(d3.axisLeft(yNew))
       .transition().duration(500).attr("opacity", 1);
  }, 1800);

  // 11. highlight top-N (2300–2800ms)
  if (limit != null) {
    setTimeout(() => {
      const topCats = sortedCats.slice(0, limit);
      const hl   = "#ffeb3b", halo = "#ffffff", pad = 2;
      segs.forEach(s => {
        if (topCats.includes(s.category) &&
            (!subgroupField || s.subgroup === subgroupKey)) {
          const bbox = d3.select(s.node).node().getBBox();
          // white halo
          svg.append("rect")
             .attr("class", "sort-outline")
             .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
             .attr("width", bbox.width + pad*2)
             .attr("height", bbox.height + pad*2)
             .attr("fill", "none")
             .attr("stroke", halo)
             .attr("stroke-width", 4)
             .attr("opacity", 0)
             .transition().duration(400).attr("opacity", 1).raise();
          // yellow outline
          svg.append("rect")
             .attr("class", "sort-outline")
             .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
             .attr("width", bbox.width + pad*2)
             .attr("height", bbox.height + pad*2)
             .attr("fill", "none")
             .attr("stroke", hl)
             .attr("stroke-width", 3)
             .attr("opacity", 0)
             .transition().duration(400).attr("opacity", 1).raise();
        }
      });
    }, 2300);
  }

  return chartId;
}
