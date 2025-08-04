// Assumes d3, getOrientation(svg), getMargins(svg) helpers are in scope

/* ------------------------------------------------------------------ */
/*   groupedBarRetrieveValue (vertical + horizontal 모두 지원)      */
/* ------------------------------------------------------------------ */
export function groupedBarRetrieveValue(chartId, op) {
  const svg = d3.select(`#${chartId} svg:last-of-type`);
  if (svg.empty()) return chartId;

  // orientation 탐지
  const orientation = getOrientation(svg);
  const { left: mL, top: mT } = getMargins(svg);

  // 0. 이전 표시 제거
  svg.selectAll(".retrieve-rect,.retrieve-label").remove();
  svg.selectAll("g.tick text")
     .attr("fill", "#000")
     .attr("font-weight", null);

  // 1. 파라미터
  const facetField    = op.keyField      || "Country";
  const facetKey      = String(op.key);
  const subgroupField = op.subgroupField || "Urban/total";
  const subgroupKey   = String(op.subgroupKey);
  const valueField    = op.field         || "Persons per square kilometers";

  // 2. 실제 바만 골라서
  const bars = svg.selectAll("rect")
    .filter(d => d && d[facetField] != null && d[subgroupField] != null);

  // 3. 다른 바는 반투명(20%) 처리
  bars.transition().duration(400)
      .attr("opacity", d =>
        String(d[facetField]) === facetKey && String(d[subgroupField]) === subgroupKey
          ? 1
          : 0.2
      );

  // 4. 타겟 바 선택
  const target = bars.filter(d =>
    String(d[facetField]) === facetKey &&
    String(d[subgroupField]) === subgroupKey
  );
  if (target.empty()) {
    console.warn("groupedBarRetrieveValue: target not found");
    return chartId;
  }

  // 5. BBox + CTM 계산 (SVG 절대 좌표)
  const node = target.node();
  const box  = node.getBBox();
  const ctm  = node.getCTM();
  const x0   = ctm.e + box.x * ctm.a;
  const y0   = ctm.f + box.y * ctm.d;
  const w0   = box.width  * ctm.a;
  const h0   = box.height * ctm.d;
  const val  = target.datum()[valueField];

  // 6. 바깥 테두리 애니메이션
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

  // 7. 값 라벨 (orientation 분기)
  if (orientation === "horizontal") {
    // 가로 차트: 막대 끝 오른쪽에, 세로 중앙 정렬
    svg.append("text")
       .attr("class", "retrieve-label")
       .attr("x", x0 + w0 + 6)
       .attr("y", y0 + h0 / 2)
       .attr("text-anchor", "start")
       .attr("dominant-baseline", "middle")
       .attr("fill", "#ffa500")
       .attr("font-weight", "bold")
       .attr("opacity", 0)
       .text(val.toLocaleString())
       .raise()
     .transition().delay(1000).duration(400)
       .attr("opacity", 1);
  } else {
    // 세로 차트: 막대 위쪽 중앙에
    svg.append("text")
       .attr("class", "retrieve-label")
       .attr("x", x0 + w0 / 2)
       .attr("y", y0 - 6)
       .attr("text-anchor", "middle")
       .attr("dominant-baseline", "auto")
       .attr("fill", "#ffa500")
       .attr("font-weight", "bold")
       .attr("opacity", 0)
       .text(val.toLocaleString())
       .raise()
     .transition().delay(1000).duration(400)
       .attr("opacity", 1);
  }

  // 8. 해당 축 틱 강조
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


// Assumes d3, getOrientation(svg), getMargins(svg) helpers are available

/* ------------------------------------------------------------------ */
/*   groupedBarFilter – facet/subgroup/value 모두 선택 (수직+수평)    */
/* ------------------------------------------------------------------ */
export function groupedBarFilter(chartId, op) {
  const svg = d3.select(`#${chartId} svg:last-of-type`);
  if (svg.empty()) return chartId;

  // orientation & margins
  const orientation = getOrientation(svg);
  const { left: mL, top: mT } = getMargins(svg);

  // 0. 초기화
  svg.selectAll(".filter-outline, .filter-label").remove();
  svg.selectAll("rect").interrupt().attr("opacity", 1);
  svg.selectAll("g.tick text").interrupt()
     .attr("fill", "#000")
     .attr("font-weight", null)
     .attr("opacity", 1);

  // 1. 파라미터
  const facetField    = op.facetField;                     
  const facetKey      = op.facetKey   != null ? String(op.facetKey) : null;
  const subgroupField = op.subgroupField;                  
  const subgroupKey   = op.subgroupKey != null ? String(op.subgroupKey) : null;
  const valueField    = op.field;                          
  const satisfy       = op.satisfy;                        
  const threshold     = op.value    != null ? +op.value : null;

  // 2. 비교 함수
  const cmpFns = {
    ">":  (v,k)=>v>k,   ">=":(v,k)=>v>=k,
    "<":  (v,k)=>v<k,   "<=":(v,k)=>v<=k,
    "==": (v,k)=>v==k,  "!=":(v,k)=>v!=k
  };
  const cmp = cmpFns[satisfy] || (()=>true);

  // 3. 매치 함수
  function isMatch(d) {
    if (facetField    && facetKey     != null && String(d[facetField])    !== facetKey)     return false;
    if (subgroupField && subgroupKey   != null && String(d[subgroupField]) !== subgroupKey) return false;
    if (valueField    && threshold     != null && !cmp(d[valueField], threshold))        return false;
    return true;
  }

  // 4. 대상 바 선택
  const bars = svg.selectAll("rect")
    .filter(d => d && (
      (facetField    && d[facetField]    != null) ||
      (subgroupField && d[subgroupField] != null) ||
      (valueField    && d[valueField]    != null)
    ));

  // 5. 페이드 처리
  bars.transition().duration(300)
    .attr("opacity", d => isMatch(d) ? 1 : 0.2);

  // 6. 하이라이트 (350ms 후)
  setTimeout(() => {
    bars.filter(isMatch).each(function(d) {
      const node = this;
      const box  = node.getBBox();
      const ct   = node.getCTM();
      const x0   = ct.e + box.x * ct.a;
      const y0   = ct.f + box.y * ct.d;
      const w0   = box.width  * ct.a;
      const h0   = box.height * ct.d;
      const perim = 2*(w0+h0);

      // white halo
      svg.append("rect")
         .attr("class","filter-outline")
         .attr("x", x0-pad).attr("y", y0-pad)
         .attr("width",  w0+pad*2).attr("height", h0+pad*2)
         .attr("fill","none").attr("stroke","#fff").attr("stroke-width",4)
         .attr("stroke-dasharray",perim).attr("stroke-dashoffset",perim)
         .raise()
       .transition().duration(300).attr("stroke-dashoffset",0);

      // yellow outline
      svg.append("rect")
         .attr("class","filter-outline")
         .attr("x", x0-pad).attr("y", y0-pad)
         .attr("width",  w0+pad*2).attr("height", h0+pad*2)
         .attr("fill","none").attr("stroke","#ffeb3b").attr("stroke-width",2)
         .attr("stroke-dasharray",perim).attr("stroke-dashoffset",perim)
         .raise()
       .transition().delay(100).duration(300).attr("stroke-dashoffset",0);

      // value label (orientation 분기)
      if (orientation === "horizontal") {
        // 오른쪽 중앙
        svg.append("text")
           .attr("class","filter-label")
           .attr("x", x0 + w0 + 6)
           .attr("y", y0 + h0/2)
           .attr("text-anchor","start")
           .attr("dominant-baseline","middle")
           .attr("fill","#ffeb3b").attr("font-weight","bold")
           .attr("opacity",0)
           .text(d[valueField].toLocaleString())
           .raise()
         .transition().delay(200).duration(300)
           .attr("opacity",1);
      } else {
        // 위쪽 중앙
        svg.append("text")
           .attr("class","filter-label")
           .attr("x", x0 + w0/2)
           .attr("y", y0 - 6)
           .attr("text-anchor","middle")
           .attr("dominant-baseline","auto")
           .attr("fill","#ffeb3b").attr("font-weight","bold")
           .attr("opacity",0)
           .text(d[valueField].toLocaleString())
           .raise()
         .transition().delay(200).duration(300)
           .attr("opacity",1);
      }
    });

    // 7. 축 눈금 강조
    if (facetKey != null) {
      svg.selectAll("g.tick").each(function(t) {
        if (String(t) === facetKey) {
          d3.select(this).select("text")
            .transition().delay(300).duration(300)
            .attr("fill","#ffeb3b")
            .attr("font-weight","bold");
        }
      });
    }
  }, 350);

  return chartId;
}


// Assumes d3, getOrientation(svg), getMargins(svg) helpers are available

/* ------------------------------------------------------------------ */
/*   groupedBarFindExtremum  (vertical + horizontal 모두 지원)       */
/* ------------------------------------------------------------------ */
export function groupedBarFindExtremum(chartId, op) {
  const svg = d3.select(`#${chartId} svg:last-of-type`);
  if (svg.empty()) return chartId;

  const orientation  = getOrientation(svg);
  const { left: mL, top: mT } = getMargins(svg);

  // 0. 이전 표시 제거 및 리셋
  svg.selectAll(".extrema-outline, .extrema-label").remove();
  svg.selectAll("rect").interrupt().attr("opacity", 1);
  svg.selectAll("g.tick text").interrupt()
     .attr("fill", "#000")
     .attr("font-weight", null)
     .attr("opacity", 1);

  // 1. 파라미터
  const facetField    = op.facetField;
  const facetKey      = op.facetKey   != null ? String(op.facetKey) : null;
  const subgroupField = op.subgroupField;
  const subgroupKey   = op.subgroupKey != null ? String(op.subgroupKey) : null;
  const valueField    = op.field;
  const type          = (op.type || "max").toLowerCase();

  // 2. 세그먼트 수집
  const segments = [];
  svg.selectAll("rect").each(function(d) {
    if (!d || d[valueField] == null) return;
    if (facetField    && facetKey   != null && String(d[facetField])    !== facetKey)     return;
    if (subgroupField && subgroupKey != null && String(d[subgroupField]) !== subgroupKey) return;
    segments.push({ node: this, datum: d, value: d[valueField] });
  });
  if (!segments.length) return chartId;

  // 3. 극값 계산
  const extremumValue = type === "min"
    ? d3.min(segments, s => s.value)
    : d3.max(segments, s => s.value);

  // 4. 나머지 바는 반투명 처리
  svg.selectAll("rect").transition().duration(300)
     .attr("opacity", d => {
       const seg = segments.find(s => s.datum === d);
       return seg && seg.value === extremumValue ? 1 : 0.2;
     });

  // 5. 하이라이트 (teal)
  const halo  = "#ffffff";
  const hl    = "#00BCD4";
  const pad   = 2;

  segments.filter(s => s.value === extremumValue).forEach((s, i) => {
    const { node, datum, value } = s;
    const box  = node.getBBox();
    const ct   = node.getCTM();
    const x0   = ct.e + box.x * ct.a;
    const y0   = ct.f + box.y * ct.d;
    const w0   = box.width  * ct.a;
    const h0   = box.height * ct.d;
    const perim = 2 * (w0 + h0);
    const label = `${type === "min" ? "MIN" : "MAX"} ${value.toLocaleString()}`;

    // 흰색 헬로
    svg.append("rect")
       .attr("class", "extrema-outline")
       .attr("x", x0 - pad).attr("y", y0 - pad)
       .attr("width",  w0 + pad*2).attr("height", h0 + pad*2)
       .attr("fill", "none").attr("stroke", halo).attr("stroke-width", 4)
       .attr("stroke-dasharray", perim).attr("stroke-dashoffset", perim)
       .raise()
     .transition().delay(i * 100).duration(400)
       .attr("stroke-dashoffset", 0);

    // teal outline
    svg.append("rect")
       .attr("class", "extrema-outline")
       .attr("x", x0 - pad).attr("y", y0 - pad)
       .attr("width",  w0 + pad*2).attr("height", h0 + pad*2)
       .attr("fill", "none").attr("stroke", hl).attr("stroke-width", 2)
       .attr("stroke-dasharray", perim).attr("stroke-dashoffset", perim)
       .raise()
     .transition().delay(i * 100 + 200).duration(400)
       .attr("stroke-dashoffset", 0);

    // 값 라벨 (orientation 분기)
    if (orientation === "horizontal") {
      // 오른쪽 중앙
      svg.append("text")
         .attr("class", "extrema-label")
         .attr("x", x0 + w0 + 6)
         .attr("y", y0 + h0/2)
         .attr("text-anchor", "start")
         .attr("dominant-baseline", "middle")
         .attr("fill", hl).attr("font-weight", "bold")
         .attr("opacity", 0)
         .text(label)
         .raise()
       .transition().delay(i * 100 + 400).duration(400)
         .attr("opacity", 1);
    } else {
      // 위쪽 중앙
      svg.append("text")
         .attr("class", "extrema-label")
         .attr("x", x0 + w0/2)
         .attr("y", y0 - pad*2 - 6)
         .attr("text-anchor", "middle")
         .attr("fill", hl).attr("font-weight", "bold")
         .attr("opacity", 0)
         .text(label)
         .raise()
       .transition().delay(i * 100 + 400).duration(400)
         .attr("opacity", 1);
    }
  });

  // 6. 축 눈금 강조
  if (facetKey != null) {
    setTimeout(() => {
      svg.selectAll("g.tick").each(function(t) {
        if (String(t) === facetKey) {
          d3.select(this).select("text")
            .transition().duration(400)
            .attr("fill", hl)
            .attr("font-weight", "bold");
        }
      });
    }, 600);
  }

  return chartId;
}


// Assumes d3, getOrientation(svg), getMargins(svg) are available
export function groupedBarCompare(chartId, op) {
  const svg = d3.select(`#${chartId} svg:last-of-type`);
  if (svg.empty()) return chartId;

  // 1) 초기화
  svg.selectAll(".compare-overlay").remove();
  const overlay = svg.append("g").attr("class", "compare-overlay");
  svg.selectAll("rect").interrupt().attr("opacity", 1);
  svg.selectAll("g.tick text").interrupt()
     .attr("fill", "#000")
     .attr("font-weight", null);

  // 2) 파라미터 & orientation
  const orientation   = getOrientation(svg); // "horizontal" or "vertical"
  const { left: mL, top: mT } = getMargins(svg);
  const keyField      = op.keyField;
  const subgroupField = op.subgroupField;
  const subgroupKey   = op.subgroupKey != null ? String(op.subgroupKey) : null;
  const valueField    = op.field;
  const leftKey       = String(op.left);
  const rightKey      = String(op.right);
  const operator      = (op.operator || "gt").toLowerCase();

  // 3) 대상 막대 찾기
  const bars = svg.selectAll("rect")
    .filter(d => d && d[keyField] != null && d[valueField] != null);
  const leftBar  = bars.filter(d =>
    String(d[keyField]) === leftKey &&
    (!subgroupField || String(d[subgroupField]) === subgroupKey)
  );
  const rightBar = bars.filter(d =>
    String(d[keyField]) === rightKey &&
    (!subgroupField || String(d[subgroupField]) === subgroupKey)
  );
  if (leftBar.empty() || rightBar.empty()) return chartId;

  // 4) 로컬→전역 좌표 헬퍼
  function toGlobal(node, xLoc, yLoc) {
    const m = node.getCTM();
    return { x: m.a*xLoc + m.c*yLoc + m.e,
             y: m.b*xLoc + m.d*yLoc + m.f };
  }
  function barGeom(sel) {
    const n = sel.node();
    const x = +n.getAttribute("x"),
          y = +n.getAttribute("y"),
          w = +n.getAttribute("width"),
          h = +n.getAttribute("height");
    let gx, gy;
    if (orientation === "horizontal") {
      // 끝점 = (x + w, y + h/2)
      ({ x: gx, y: gy } = toGlobal(n, x + w, y + h/2));
    } else {
      // top 중앙 = (x + w/2, y)
      ({ x: gx, y: gy } = toGlobal(n, x + w/2, y));
    }
    return { gx, gy, v: sel.datum()[valueField], node: n };
  }

  // 5) 나머지 바 디밍 + 색상
  svg.selectAll("rect").transition().duration(350)
     .attr("opacity", function() {
       return (this === leftBar.node() || this === rightBar.node()) ? 1 : 0.25;
     });
  const colorL = "#ff8a65", colorR = "#42a5f5", lineC = "#37474F";
  leftBar.attr("fill", colorL).attr("stroke", "#000");
  rightBar.attr("fill", colorR).attr("stroke", "#000");

  // 6) 좌표 계산
  const L = barGeom(leftBar);
  const R = barGeom(rightBar);

  // 7) 값 라벨
  function valueLabel({gx, gy, v}, color, delay=350) {
    overlay.append("text")
      .attr("class", "compare-val")
      .attr("x", gx + (orientation==="horizontal"? 6 : 0))
      .attr("y", gy + (orientation==="horizontal"? 0 : -6))
      .attr("text-anchor", orientation==="horizontal" ? "start" : "middle")
      .attr("dominant-baseline", orientation==="horizontal" ? "middle" : "auto")
      .attr("fill", color)
      .attr("font-weight", "bold")
      .attr("opacity", 0)
      .text(v.toLocaleString())
      .raise()
     .transition().delay(delay).duration(350)
      .attr("opacity", 1);
  }
  valueLabel(L, colorL);
  valueLabel(R, colorR, 450);

  // 8) 전체 영역 경계
  const { xMin, xMax, yMin, yMax } = (() => {
    if (orientation === "horizontal") {
      // y축 domain path에서 min/max Y 추출
      const yAxis = svg.selectAll("g").filter(function() {
        const t = d3.select(this).attr("transform")||"";
        return /^translate\(0,/.test(t);
      }).node();
      if (yAxis) {
        const path = d3.select(yAxis).select("path.domain").attr("d")||"";
        const m = /M\s*[-\d.]+,\s*([-\d.]+)/.exec(path);
        if (m) {
          const scale = d3.scaleLinear()
                          .domain([0,1])
                          .range([+m[1], +m[1]]); // fallback
          return { xMin: L.gx, xMax: R.gx, yMin: +m[1], yMax: +m[1] };
        }
      }
    }
    // fallback
    const xs = bars.nodes().flatMap(n=>{
      const b = n.getBBox();
      const p1 = toGlobal(n, b.x, b.y), p2 = toGlobal(n, b.x+b.width, b.y+b.height);
      return [p1.x,p2.x,p1.y,p2.y];
    });
    return {
      xMin: d3.min(xs),
      xMax: d3.max(xs),
      yMin: d3.min(xs),
      yMax: d3.max(xs)
    };
  })();

  // 9) 점선 연결
  function drawLine(x1,y1,x2,y2,delay=600) {
    const len = Math.hypot(x2-x1,y2-y1);
    overlay.append("line")
      .attr("class","compare-line")
      .attr("x1", x1).attr("y1", y1)
      .attr("x2", x1).attr("y2", y1)
      .attr("stroke", lineC).attr("stroke-width", 2)
      .attr("stroke-dasharray", `${len} ${len}`)
      .attr("stroke-dashoffset", len)
      .raise()
     .transition().delay(delay).duration(600)
      .attr("x2", x2).attr("y2", y2)
      .attr("stroke-dashoffset", 0);
  }
  drawLine(L.gx, L.gy, R.gx, L.gy, 600);  // 수평선
  drawLine(R.gx, L.gy, R.gx, R.gy, 800);  // 수직 브래킷

  // 10) Δ 라벨
  const delta = Math.abs(L.v - R.v);
  overlay.append("text")
    .attr("class","compare-delta")
    .attr("x", (L.gx+R.gx)/2)
    .attr("y", (L.gy+R.gy)/2 + (orientation==="horizontal"? -8 : -8))
    .attr("text-anchor","middle")
    .attr("fill", lineC)
    .attr("font-weight","bold")
    .attr("opacity", 0)
    .text(`Δ ${delta.toLocaleString()}`)
    .raise()
   .transition().delay(1200).duration(400)
    .attr("opacity",1);

  // 11) 결과 라벨
  const cmpFns = { gt:(a,b)=>a>b, lt:(a,b)=>a<b, gte:(a,b)=>a>=b, lte:(a,b)=>a<=b, eq:(a,b)=>a===b, ne:(a,b)=>a!==b };
  const symMap = { gt:">", lt:"<", gte:"≥", lte:"≤", eq:"=", ne:"≠" };
  const ok = cmpFns[operator](L.v, R.v);
  overlay.append("text")
    .attr("class","compare-result")
    .attr("x", (L.gx+R.gx)/2)
    .attr("y", (orientation==="horizontal"? Math.min(L.gy,R.gy)-24 : L.gy-24))
    .attr("text-anchor","middle")
    .attr("fill", ok ? "#2e7d32" : "#c62828")
    .attr("font-weight","bold")
    .attr("opacity",0)
    .text(`${leftKey} ${symMap[operator]||">"} ${rightKey} ${ok?"✓":"✗"}`)
    .raise()
   .transition().delay(1400).duration(400)
    .attr("opacity",1);

  // 12) 축 눈금 강조
  svg.selectAll("g.tick").each(function(t) {
    if (String(t)===leftKey || String(t)===rightKey) {
      d3.select(this).select("text")
        .transition().delay(1600).duration(400)
        .attr("fill", lineC)
        .attr("font-weight","bold");
    }
  });

  return chartId;
}


/* ------------------------------------------------------------------ */
/* groupedBarDetermineRange – 그룹 바 유지 + min/max 범위 표시       */
/* ------------------------------------------------------------------ */
export function groupedBarDetermineRange(chartId, op) {
  const svg = d3.select(`#${chartId} svg:last-of-type`);
  if (svg.empty()) return chartId;

  // 초기화
  svg.selectAll(".range-overlay").remove();
  const overlay = svg.append("g").attr("class", "range-overlay");
  svg.selectAll("rect").interrupt().attr("opacity", 1);
  svg.selectAll("g.tick text").interrupt()
     .attr("fill", "#000").attr("font-weight", null);

  // 파라미터
  const facetField    = op.facetField  ?? op.keyField;
  const facetKey      = op.facetKey    ?? op.key;
  const subgroupField = op.subgroupField;
  const subgroupKey   = op.subgroupKey;
  const valueField    = op.field;

  // 1) 전체 바, 2) 선택된 그룹의 바
  const allBars = svg.selectAll("rect")
    .filter(d => d && d[valueField] != null);
  let selBars = allBars;
  if (facetField && facetKey != null) {
    selBars = selBars.filter(d => String(d[facetField]) === String(facetKey));
  }
  if (subgroupField && subgroupKey != null) {
    selBars = selBars.filter(d => String(d[subgroupField]) === String(subgroupKey));
  }
  const selNodes = new Set(selBars.nodes());
  if (!selBars.size()) return chartId;

  // 2) 값 추출
  const vals = selBars.nodes().map(n => d3.select(n).datum()[valueField]);
  const minVal = d3.min(vals), maxVal = d3.max(vals), delta = maxVal - minVal;

  // 3) 전역 좌표 헬퍼
  function toGlobal(node,xLocal,yLocal){
    const m = node.getCTM();
    return { x: m.a*xLocal + m.c*yLocal + m.e,
             y: m.b*xLocal + m.d*yLocal + m.f };
  }
  function barTop(node){
    const x0 = +node.getAttribute("x"),
          y0 = +node.getAttribute("y"),
          w0 = +node.getAttribute("width");
    return toGlobal(node, x0 + w0/2, y0);
  }

  // 4) min/max 노드
  const selArray = selBars.nodes();
  const minNode = selArray[vals.indexOf(minVal)];
  const maxNode = selArray[vals.indexOf(maxVal)];
  const minG = barTop(minNode), maxG = barTop(maxNode);

  // 5) 그룹 외 바 디밍
  allBars.transition().duration(300)
    .attr("opacity", function() {
      return selNodes.has(this) ? 1 : 0.25;
    });

  // 6) 플롯 x경계 계산
  let xMin, xMax;
  const xAxisG = svg.selectAll("g").filter(function(){
    const t = d3.select(this).attr("transform")||"";
    return /^translate\(0,/.test(t) && d3.select(this).selectAll("path.domain").size();
  }).node();
  if (xAxisG) {
    const dAttr = d3.select(xAxisG).select("path.domain").attr("d")||"";
    const m = /M\s*([-\d.]+),[-\d.]+\s*H\s*([-\d.]+)/.exec(dAttr);
    if (m) { xMin=+m[1]; xMax=+m[2]; }
  }
  if (xMin==null) {
    const xs = selBars.nodes().flatMap(n=>{
      const x0=+n.getAttribute("x"), w0=+n.getAttribute("width");
      const p1=toGlobal(n,x0,0), p2=toGlobal(n,x0+w0,0);
      return [p1.x,p2.x];
    });
    xMin=d3.min(xs); xMax=d3.max(xs);
  }

  const lineC = "#ffb74d";

  // 7) 풀폭 수평 점선 (min/max)
  function drawHLine(y, delay=400) {
    const len = xMax - xMin;
    overlay.append("line")
      .attr("class","range-line")
      .attr("x1", xMin).attr("y1", y)
      .attr("x2", xMin).attr("y2", y)
      .attr("stroke", lineC).attr("stroke-width",2)
      .attr("stroke-dasharray","4 4")
      .attr("shape-rendering","crispEdges")
      .raise()
    .transition().delay(delay).duration(600)
      .attr("x2", xMax);
  }
  drawHLine(minG.y);
  drawHLine(maxG.y, 600);

  // 8) Δ 브래킷
  const midX = (minG.x + maxG.x)/2;
  overlay.append("line")
    .attr("class","range-line")
    .attr("x1", midX).attr("x2", midX)
    .attr("y1", minG.y).attr("y2", minG.y)
    .attr("stroke",lineC).attr("stroke-width",2)
    .attr("stroke-dasharray","4 4")
    .attr("shape-rendering","crispEdges")
    .raise()
  .transition().delay(1000).duration(600)
    .attr("y2", maxG.y);

  // 9) Δ 라벨
  overlay.append("text")
    .attr("class","delta-label")
    .attr("x", midX + 6)
    .attr("y", (minG.y + maxG.y)/2)
    .attr("dominant-baseline","middle")
    .attr("fill",lineC).attr("font-weight","bold")
    .attr("opacity",0)
    .text(`Δ ${delta.toLocaleString()}`)
    .raise()
  .transition().delay(1600).duration(400)
    .attr("opacity",1);

  // 10) 값 라벨 (min/max)
  function annotate(G, v, d) {
    overlay.append("text")
      .attr("class","annotation")
      .attr("x", G.x).attr("y", G.y - 8)
      .attr("text-anchor","middle")
      .attr("fill", lineC).attr("font-weight","bold")
      .attr("opacity",0)
      .text(v.toLocaleString())
      .raise()
    .transition().delay(d).duration(400)
      .attr("opacity",1);
  }
  annotate(minG, minVal, 600);
  annotate(maxG, maxVal, 800);

  // 11) x축 틱 하이라이트 (그룹 facetField 값)
  svg.selectAll("g.tick").each(function(t) {
    if (String(t) === String(facetKey)) {
      d3.select(this).select("text")
        .transition().delay(700).duration(300)
        .attr("fill", lineC).attr("font-weight","bold");
    }
  });

  return chartId;
}

/* ------------------------------------------------------------------ */
/* groupedBarSort – 기본 차트 → non‐subgroup(rect) 페이드아웃 → 남은 subgroup 그룹만 정렬+강조 */
/* ------------------------------------------------------------------ */
export function groupedBarSort(chartId, op) {
  const svg = d3.select(`#${chartId} svg:last-of-type`);
  if (svg.empty()) return chartId;

  const {
    keyField:      facetField,    // ex. "age"
    subgroupField,                 // ex. "gender"
    subgroupKey,                   // ex. "Male"
    field:          valueField,    // ex. "people"
    order = "ascending",
    limit
  } = op;

  const sortFn        = order === "descending" ? d3.descending : d3.ascending;
  const highlightColor = "#00e676";
  const fadeDur       = 800;

  // 1) “Female” rect만 부드럽게 투명→0, 끝나면 제거
  svg.selectAll("rect")
    .filter(d => d && String(d[subgroupField]) !== subgroupKey)
    .transition().duration(fadeDur)
      .attr("opacity", 0)
    .remove();

  // 2) 해당 fadeDur + 100ms 후 정렬 시작
  setTimeout(() => {
    // a) 해당 subgroupKey 막대가 남아 있는 그룹(<g>)만 골라내기
    let groups = svg.selectAll("g").filter(function() {
      const sel = d3.select(this);
      // 그룹 안에 subgroupKey 막대가 하나라도 있는지 검사
      return sel.selectAll("rect")
                .filter(d => d && String(d[subgroupField]) === subgroupKey)
                .size() > 0;
    });

    // b) 그룹별 facet 키와 값 수집
    const facets = groups.nodes().map(node => {
      const grp = d3.select(node);
      const key = grp.select("text").text();  // 나이(=facetField)
      // 이 그룹의 subgroupKey 막대 datum
      const bar = grp.selectAll("rect")
        .filter(d => d && String(d[subgroupField]) === subgroupKey);
      return { node, key, value: bar.datum()[valueField] };
    });

    if (!facets.length) return;

    // c) 값 기준으로 정렬
    facets.sort((a, b) => sortFn(a.value, b.value));

    // d) x-scale & x축 재생성
    const margin = { left: 60, right: 120, top: 50, bottom: 50 };
    const fullW  = +svg.attr("width"), fullH = +svg.attr("height");
    const plotW  = fullW - margin.left - margin.right;
    const plotH  = fullH - margin.top  - margin.bottom;
    const x0 = d3.scaleBand()
      .domain(facets.map(f => f.key))
      .range([margin.left, margin.left + plotW])
      .padding(0.2);

    svg.selectAll("g")
      .filter(function() {
        const tr = d3.select(this).attr("transform") || "";
        return tr === `translate(0,${margin.top + plotH})`;
      })
      .remove();

    svg.append("g")
      .attr("transform", `translate(0,${margin.top + plotH})`)
      .call(d3.axisBottom(x0).tickFormat(d => d));

    // e) 그룹 단위로 translate 이동(0→800ms)
    facets.forEach(f => {
      d3.select(f.node)
        .raise()
        .transition().duration(800)
        .attr("transform", `translate(${x0(f.key)},0)`);
    });

    // f) 상위 N개 그룹만 테두리 강조
    if (limit != null) {
      const topSet = new Set(facets.slice(0, limit).map(f => f.key));
      facets.forEach(f => {
        if (topSet.has(f.key)) {
          d3.select(f.node).selectAll("rect")
            .transition().delay(800).duration(400)
            .attr("stroke", highlightColor)
            .attr("stroke-width", 3);
        }
      });
    }
  }, fadeDur + 100);

  return chartId;
}
