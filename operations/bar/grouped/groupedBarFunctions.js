/* ------------------------------------------------------------------ */
/*   groupedBarRetrieveValue (animated + correct outline position)    */
/* ------------------------------------------------------------------ */
export function groupedBarRetrieveValue(chartId, op) {
  const svg = d3.select(`#${chartId} svg:last-of-type`);
  if (svg.empty()) return chartId;

  // 0. clear previous
  svg.selectAll(".retrieve-rect,.retrieve-label").remove();
  svg.selectAll("g.tick text")
     .attr("fill", "#000")
     .attr("font-weight", null);

  // 1. params
  const facetField    = op.keyField      || "age";
  const facetKey      = String(op.key);
  const subgroupField = op.subgroupField || "gender";
  const subgroupKey   = String(op.subgroupKey);
  const valueField    = op.field         || "people";

  // 2. collect only real bars
  const bars = svg.selectAll("rect")
    .filter(d => d && d[facetField] != null && d[subgroupField] != null);

  // 3. fade others down to 20%
  bars.transition().duration(400)
      .attr("opacity", d =>
        String(d[facetField])===facetKey && String(d[subgroupField])===subgroupKey
          ? 1
          : 0.2
      );

  // 4. pick out the exact target
  const target = bars.filter(d =>
    String(d[facetField]) === facetKey &&
    String(d[subgroupField]) === subgroupKey
  );
  if (target.empty()) {
    console.warn("groupedBarRetrieveValue: target not found");
    return chartId;
  }

  // 5. compute its global bbox
  const node = target.node();
  const box  = node.getBBox();
  const ctm  = node.getCTM();
  const x0   = ctm.e + box.x * ctm.a;
  const y0   = ctm.f + box.y * ctm.d;
  const w0   = box.width  * ctm.a;
  const h0   = box.height * ctm.d;
  const value = target.datum()[valueField];

  // 6. animate outline drawing
  const perim = 2 * (w0 + h0);
  svg.append("rect")
     .attr("class", "retrieve-rect")
     .attr("x", x0).attr("y", y0)
     .attr("width",  w0).attr("height", h0)
     .attr("fill", "none")
     .attr("stroke", "#ffa500")
     .attr("stroke-width", 2)
     .attr("stroke-dasharray", perim)
     .attr("stroke-dashoffset", perim)
     .raise()
   .transition().delay(400).duration(600)
     .attr("stroke-dashoffset", 0);

  // 7. label fade+slide
  svg.append("text")
     .attr("class", "retrieve-label")
     .attr("x", x0 + w0/2)
     .attr("y", y0 - 20)              // start higher
     .attr("text-anchor", "middle")
     .attr("fill", "#ffa500")
     .attr("font-weight", "bold")
     .attr("opacity", 0)
     .text(value.toLocaleString())
     .raise()
   .transition().delay(1000).duration(400)
     .attr("y", y0 - 6)
     .attr("opacity", 1);

  // 8. highlight x-tick
  svg.selectAll("g.tick").each(function(t) {
    if (String(t) === facetKey) {
      d3.select(this).select("text")
        .transition().delay(1000).duration(400)
        .attr("fill", "#ffa500")
        .attr("font-weight", "bold");
    }
  });

  return chartId;
}


/* ------------------------------------------------------------------ */
/*   groupedBarFilter – animated filter & highlight                    */
/* ------------------------------------------------------------------ */
export function groupedBarFilter(chartId, op) {
  const svg = d3.select(`#${chartId} svg:last-of-type`);
  if (svg.empty()) return chartId;

  // 0. clear any old highlights
  svg.selectAll(".filter-rect,.filter-label").remove();
  svg.selectAll("g.tick text")
     .attr("fill", "#000")
     .attr("font-weight", null);

  // 1. parameters
  const field         = op.field         || "people";      // quantitative field
  const satisfy       = op.satisfy       || ">=";          // one of >,>=,<,<=,==,!=
  const keyValue      = op.key;                              // numeric threshold
  const facetField    = op.keyField      || null;            // e.g. "age"
  const facetKey      = facetField ? String(op.key) : null;  // e.g. "30"
  const subgroupField = op.subgroupField || null;            // e.g. "gender"
  const subgroupKey   = op.subgroupKey   != null
                         ? String(op.subgroupKey)
                         : null;

  // 2. comparator
  const cmpFns = {
    ">":  (v,k)=>v>k,
    ">=": (v,k)=>v>=k,
    "<":  (v,k)=>v<k,
    "<=": (v,k)=>v<=k,
    "==": (v,k)=>v==k,
    "!=": (v,k)=>v!=k
  };
  const cmp = cmpFns[satisfy] || cmpFns[">="];

  // 3. select only the data‐bars
  const bars = svg.selectAll("rect")
    .filter(d => d && d[facetField] != null && d[field] != null);

  // 4. fade‐out / keep‐opaque
  bars.transition().duration(400)
      .attr("opacity", d => {
        let pass = true;
        if (facetField)    pass = pass && (String(d[facetField])    === facetKey);
        if (subgroupField) pass = pass && (String(d[subgroupField]) === subgroupKey);
        if (op.field != null) pass = pass && cmp(d[field], keyValue);
        return pass ? 1 : 0.25;
      });

  // 5. after fade, draw outlines+labels for the passing bars
  setTimeout(() => {
    const highlightAges = new Set();
    bars.each(function(d) {
      let pass = true;
      if (facetField)    pass = pass && (String(d[facetField])    === facetKey);
      if (subgroupField) pass = pass && (String(d[subgroupField]) === subgroupKey);
      if (op.field != null) pass = pass && cmp(d[field], keyValue);
      if (!pass) return;

      // compute global bounding box via CTM
      const node = this;
      const box  = node.getBBox();
      const ctm  = node.getCTM();
      const x0   = ctm.e + box.x * ctm.a;
      const y0   = ctm.f + box.y * ctm.d;
      const w0   = box.width  * ctm.a;
      const h0   = box.height * ctm.d;
      const perim = 2 * (w0 + h0);

      // 5a. white halo + yellow outline (dash draw)
      svg.append("rect")
         .attr("class","filter-rect")
         .attr("x", x0).attr("y", y0)
         .attr("width", w0).attr("height", h0)
         .attr("fill","none")
         .attr("stroke","#ffffff").attr("stroke-width",4)
         .attr("stroke-dasharray", perim).attr("stroke-dashoffset", perim)
         .raise()
       .transition().duration(400).attr("stroke-dashoffset", 0);

      svg.append("rect")
         .attr("class","filter-rect")
         .attr("x", x0).attr("y", y0)
         .attr("width", w0).attr("height", h0)
         .attr("fill","none")
         .attr("stroke","#ffeb3b").attr("stroke-width",2)
         .attr("stroke-dasharray", perim).attr("stroke-dashoffset", perim)
         .raise()
       .transition().duration(400).attr("stroke-dashoffset", 0);

      // 5b. value label
      svg.append("text")
         .attr("class","filter-label")
         .attr("x", x0 + w0/2)
         .attr("y", y0 - 20)
         .attr("text-anchor","middle")
         .attr("fill","#ffeb3b").attr("font-weight","bold")
         .attr("opacity",0)
         .text(d[field].toLocaleString())
         .raise()
       .transition().delay(200).duration(300)
         .attr("y", y0 - 6).attr("opacity",1);

      highlightAges.add(String(d[facetField]));
    });

    // 5c. highlight x-axis tick(s)
    svg.selectAll("g.tick").each(function(t) {
      if (highlightAges.has(String(t))) {
        d3.select(this).select("text")
          .attr("fill","#ffeb3b")
          .attr("font-weight","bold");
      }
    });
  }, 450);

  return chartId;
}


export function groupedBarFindExtremum(chartId, op) {}

export function groupedBarCompare(chartId, op) {}

export function groupedBarDetermineRange(chartId, op) {}

export function groupedBarSort(chartId, op) {}