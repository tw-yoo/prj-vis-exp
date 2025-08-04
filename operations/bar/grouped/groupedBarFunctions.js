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

/* ------------------------------------------------------------------ */
/* groupedBarCompare – CTM 기반 전역좌표 + 풀폭 수평 점선 + Δ 브래킷 */
/* ------------------------------------------------------------------ */
export function groupedBarCompare(chartId, op) {
  const svg = d3.select(`#${chartId} svg:last-of-type`);
  if (svg.empty()) return chartId;

  // 1. 초기화
  svg.selectAll(".compare-overlay").remove();
  const overlay = svg.append("g").attr("class", "compare-overlay");
  svg.selectAll("rect").interrupt().attr("opacity", 1);
  svg.selectAll("g.tick text").interrupt()
     .attr("fill", "#000")
     .attr("font-weight", null);

  // 2. 파라미터
  const keyField      = op.keyField;
  const subgroupField = op.subgroupField;
  const subgroupKey   = op.subgroupKey != null ? String(op.subgroupKey) : null;
  const valueField    = op.field;
  const leftKey       = String(op.left);
  const rightKey      = String(op.right);
  const operator      = (op.operator || "gt").toLowerCase();

  // 3. 대상 막대 찾기
  const bars = svg.selectAll("rect")
    .filter(d => d && d[keyField] != null && d[valueField] != null);
  const leftBar  = bars.filter(d => String(d[keyField]) === leftKey  &&
                    (!subgroupField || String(d[subgroupField]) === subgroupKey));
  const rightBar = bars.filter(d => String(d[keyField]) === rightKey &&
                    (!subgroupField || String(d[subgroupField]) === subgroupKey));
  if (leftBar.empty() || rightBar.empty()) return chartId;

  // 4. 로컬→전역 좌표 변환 헬퍼
  function toGlobal(node, xLocal, yLocal) {
    const m = node.getCTM();
    return { x: m.a*xLocal + m.c*yLocal + m.e,
             y: m.b*xLocal + m.d*yLocal + m.f };
  }
  function barGeom(sel) {
    const n = sel.node();
    const x = +n.getAttribute("x"),
          y = +n.getAttribute("y"),
          w = +n.getAttribute("width");
    const cxLocal = x + w/2, yLocal = y;
    const { x: cx, y: yTop } = toGlobal(n, cxLocal, yLocal);
    return { cx, yTop, v: sel.datum()[valueField], node: n };
  }

  // 5. 나머지 막대 디밍
  svg.selectAll("rect").transition().duration(350)
     .attr("opacity", function() {
       return (this === leftBar.node() || this === rightBar.node()) ? 1 : 0.25;
     });

  // 6. 색상 설정
  const colorL = "#ff8a65", colorR = "#42a5f5", lineC = "#37474F";
  leftBar.attr("fill", colorL).attr("stroke", "#000");
  rightBar.attr("fill", colorR).attr("stroke", "#000");

  // 7. 각 막대 top 정보
  const L = barGeom(leftBar);
  const R = barGeom(rightBar);

  // 8. 값 라벨
  function valueLabel({cx, yTop, v}, color, delay=350) {
    overlay.append("text")
      .attr("class","compare-val")
      .attr("x", cx).attr("y", yTop - 8)
      .attr("text-anchor","middle")
      .attr("fill", color).attr("font-weight","bold")
      .attr("opacity", 0)
      .text(v.toLocaleString())
      .raise()
    .transition().delay(delay).duration(350)
      .attr("opacity",1);
  }
  valueLabel(L, colorL);
  valueLabel(R, colorR);

  // 9. 플롯 영역 경계 계산 (x축 domain path 이용)
  function plotBounds() {
    const xAxis = svg.selectAll("g").filter(function() {
      const t = d3.select(this).attr("transform") || "";
      return /^translate\(0,/.test(t) && !d3.select(this).selectAll("path.domain").empty();
    }).node();
    if (xAxis) {
      const dAttr = d3.select(xAxis).select("path.domain").attr("d") || "";
      const m = /M\s*([-\d.]+),\s*([-\d.]+)\s*H\s*([-\d.]+)/.exec(dAttr);
      if (m) return { xMin:+m[1], xMax:+m[3] };
    }
    // fallback: 모든 바의 전역 x
    const xs = bars.nodes().flatMap(n => {
      const x0 = +n.getAttribute("x"), y0 = +n.getAttribute("y"),
            w0 = +n.getAttribute("width");
      const p1 = toGlobal(n, x0, y0), p2 = toGlobal(n, x0 + w0, y0);
      return [p1.x, p2.x];
    });
    return { xMin: d3.min(xs), xMax: d3.max(xs) };
  }
  const { xMin, xMax } = plotBounds();

  // 10. 풀폭 수평 점선 (두 높이에 대해)
  function fullWidthLine(y, delay=450) {
    const len = xMax - xMin;
    overlay.append("line")
      .attr("class","compare-line")
      .attr("x1", xMin).attr("y1", y)
      .attr("x2", xMin).attr("y2", y)
      .attr("stroke", lineC).attr("stroke-width", 1.5)
      .attr("stroke-dasharray", `${len} ${len}`)
      .attr("stroke-dashoffset", len)
      .attr("shape-rendering", "crispEdges")
      .raise()
    .transition().delay(delay).duration(600)
      .attr("x2", xMax).attr("stroke-dashoffset",0);
  }
  fullWidthLine(L.yTop, 450);
  fullWidthLine(R.yTop, 550);

  // 11. Δ 브래킷(수직) + 라벨
  const midX = (L.cx + R.cx)/2;
  const yA = Math.min(L.yTop, R.yTop);
  const yB = Math.max(L.yTop, R.yTop);

  overlay.append("line")
    .attr("class","compare-line")
    .attr("x1", midX).attr("x2", midX)
    .attr("y1", yA).attr("y2", yA)
    .attr("stroke", lineC).attr("stroke-width", 2)
    .attr("stroke-dasharray","4 2")
    .attr("shape-rendering", "crispEdges")
    .raise()
  .transition().delay(1000).duration(450)
    .attr("y2", yB);

  const delta = Math.abs(L.v - R.v);
  overlay.append("text")
    .attr("class","compare-delta")
    .attr("x", midX).attr("y", (yA+yB)/2 - 8)
    .attr("text-anchor","middle")
    .attr("fill", lineC).attr("font-weight","bold")
    .attr("opacity",0)
    .text(`Δ ${delta.toLocaleString()}`)
    .raise()
  .transition().delay(1200).duration(350)
    .attr("opacity",1);

  // 12. 결과 라벨
  const cmpFns = {
    gt: (a,b)=>a>b, gte:(a,b)=>a>=b,
    lt: (a,b)=>a<b, lte:(a,b)=>a<=b,
    eq: (a,b)=>a===b, neq:(a,b)=>a!==b
  };
  const cmp = cmpFns[operator] || cmpFns.gt;
  const sym = {gt:">", gte:"≥", lt:"<", lte:"≤", eq:"=", neq:"≠"}[operator] || ">";
  const ok  = cmp(L.v, R.v);

  overlay.append("text")
    .attr("class","compare-result")
    .attr("x", midX).attr("y", yA - 24)
    .attr("text-anchor","middle")
    .attr("fill", ok ? "#2e7d32" : "#c62828")
    .attr("font-weight","bold")
    .attr("opacity",0)
    .text(`${leftKey} ${sym} ${rightKey} ${ok ? "✓" : "✗"}`)
    .raise()
  .transition().delay(1200).duration(350)
    .attr("opacity",1);

  // 13. x축 틱 강조
  svg.selectAll("g.tick").each(function(t) {
    if (String(t) === leftKey || String(t) === rightKey) {
      d3.select(this).select("text")
        .transition().delay(700).duration(300)
        .attr("fill", lineC)
        .attr("font-weight","bold");
    }
  });

  return chartId;
}
export function groupedBarDetermineRange(chartId, op) {
  const svg = d3.select(`#${chartId} svg:last-of-type`);
  if (svg.empty()) return chartId;

  // 초기화
  svg.selectAll(".range-overlay").remove();
  const overlay = svg.append("g").attr("class", "range-ovrelay");
  svg.selectAll("rect").interrupt().attr("opacity", 1);
  svg.selectAll("g.tick text").interrupt()
     .attr("fill", "#000").attr("font-weight", null);

  const orientation = getOrientation(svg); // "horizontal" or "vertical"
  const { left: mL, top: mT } = getMargins(svg);

  // 파라미터
  const facetField    = op.facetField  ?? op.keyField;
  const facetKey      = op.facetKey    ?? op.key;
  const subgroupField = op.subgroupField;
  const subgroupKey   = op.subgroupKey;
  const valueField    = op.field;

  // 모든 바와 선택된 바 필터링
  const allBars = svg.selectAll("rect").filter(d => d && d[valueField] != null);
  let selBars = allBars;
  if (facetField && facetKey != null) selBars = selBars.filter(d => String(d[facetField]) === String(facetKey));
  if (subgroupField && subgroupKey != null) selBars = selBars.filter(d => String(d[subgroupField]) === String(subgroupKey));
  if (!selBars.size()) return chartId;
  const selSet = new Set(selBars.nodes());

  // 값 추출
  const vals = selBars.nodes().map(n => d3.select(n).datum()[valueField]);
  const minVal = d3.min(vals), maxVal = d3.max(vals), delta = maxVal - minVal;

  // 전역 좌표 헬퍼
  function toGlobal(node, xLoc, yLoc) {
    const m = node.getCTM();
    return { x: m.a*xLoc + m.c*yLoc + m.e, y: m.b*xLoc + m.d*yLoc + m.f };
  }
  function barCoord(node) {
    const x0 = +node.getAttribute("x"), y0 = +node.getAttribute("y");
    const w0 = +node.getAttribute("width"), h0 = +node.getAttribute("height");
    if (orientation === "horizontal") {
      // 끝점 중간 높이
      return toGlobal(node, x0 + w0, y0 + h0/2);
    } else {
      // 상단 중앙
      return toGlobal(node, x0 + w0/2, y0);
    }
  }

  // min/max 좌표
  const nodes = selBars.nodes();
  const minG = barCoord(nodes[vals.indexOf(minVal)]);
  const maxG = barCoord(nodes[vals.indexOf(maxVal)]);

  // 그룹 외 바 투명도 조정
  allBars.transition().duration(300).attr("opacity", n => selSet.has(n) ? 1 : 0.25);

  // 플롯 영역 경계 계산
  let xMin, xMax, yMin, yMax;
  if (orientation === "horizontal") {
    // horizontal: 수직선 그리기 위해 y축 domain path
    const yAxis = svg.selectAll("g").filter(function() {
      return /^translate\(0,/.test(d3.select(this).attr("transform")||"");
    }).node();
    if (yAxis) {
      const d = d3.select(yAxis).select("path.domain").attr("d")||"";
      const m = /M [^,]+,([\d.-]+) L/.exec(d);
      if (m) { yMin = yMax = +m[1]; }
    }
  } else {
    // vertical: 수평선 그리기 위해 x축 domain path
    const xAxis = svg.selectAll("g").filter(function() {
      return /^translate\(\d+,0\)/.test(d3.select(this).attr("transform")||"");
    }).node();
    if (xAxis) {
      const d = d3.select(xAxis).select("path.domain").attr("d")||"";
      const m = /L ([\d.-]+),/.exec(d);
      if (m) { xMin = xMax = +m[1]; }
    }
  }
  // fallback 모두 바에서 추출
  if (xMin==null||xMax==null||yMin==null||yMax==null) {
    const coords = selBars.nodes().flatMap(n => {
      const p1 = toGlobal(n, +n.getAttribute("x"), +n.getAttribute("y"));
      const p2 = toGlobal(n,
        +n.getAttribute("x") + +n.getAttribute("width"),
        +n.getAttribute("y") + +n.getAttribute("height")
      );
      return [p1, p2];
    });
    xMin = xMin!=null?xMin:d3.min(coords.map(c=>c.x));
    xMax = xMax!=null?xMax:d3.max(coords.map(c=>c.x));
    yMin = yMin!=null?yMin:d3.min(coords.map(c=>c.y));
    yMax = yMax!=null?yMax:d3.max(coords.map(c=>c.y));
  }

  const lineC = "#ffb74d";

  // min/max 라인: orientation에 따라 선 방향 결정
  function drawRange(start, end, fixed, isVerticalLine, delay) {
    overlay.append("line")
      .attr("class","range-line")
      .attr("x1", isVerticalLine? fixed: start)
      .attr("y1", isVerticalLine? start: fixed)
      .attr("x2", isVerticalLine? fixed: start)
      .attr("y2", isVerticalLine? start: fixed)
      .attr("stroke", lineC).attr("stroke-width",2)
      .attr("stroke-dasharray","4 4").attr("shape-rendering","crispEdges")
      .raise()
    .transition().delay(delay).duration(600)
      .attr(isVerticalLine?"y2":"x2", end);
  }
  if (orientation === "horizontal") {
    // horizontal 차트에서는 수직선
    drawRange(yMin, yMax, minG.x, true, 400);
    drawRange(yMin, yMax, maxG.x, true, 800);
  } else {
    // vertical 차트에서는 수평선
    drawRange(xMin, xMax, minG.y, false, 400);
    drawRange(xMin, xMax, maxG.y, false, 800);
  }

  // Δ 브래킷: 표시 방향 반전
  const midStart = orientation === "horizontal" ? yMin : xMin;
  const midEnd   = orientation === "horizontal" ? yMax : xMax;
  const perpPos  = orientation === "horizontal" ? (minG.x+maxG.x)/2 : (minG.y+maxG.y)/2;

  overlay.append("line")
    .attr("class","range-line")
    .attr("x1", orientation === "horizontal" ? minG.x : perpPos)
    .attr("y1", orientation === "horizontal" ? perpPos : minG.y)
    .attr("x2", orientation === "horizontal" ? minG.x : perpPos)
    .attr("y2", orientation === "horizontal" ? perpPos : minG.y)
    .attr("stroke", lineC).attr("stroke-width",2)
    .attr("stroke-dasharray","4 4").attr("shape-rendering","crispEdges")
    .raise()
  .transition().delay(1000).duration(600)
    .attr(orientation==="horizontal"?"x1":"y2", orientation==="horizontal"? maxG.x : maxG.y);

  // Δ 라벨
  overlay.append("text")
    .attr("class","delta-label")
    .attr("x", orientation==="horizontal"? perpPos + 6 : midStart)
    .attr("y", orientation==="horizontal"? midStart : perpPos - 8)
    .attr("fill", lineC).attr("font-weight","bold")
    .attr("opacity",0)
    .text(`Δ ${delta.toLocaleString()}`)
    .raise()
  .transition().delay(1600).duration(400)
    .attr("opacity",1);

  // 값 라벨
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

  // 축 틱 강조
  svg.selectAll("g.tick").each(function(t) {
    if (String(t) === String(facetKey)) {
      d3.select(this).select("text")
        .transition().delay(700).duration(300)
        .attr("fill",lineC).attr("font-weight","bold");
    }
  });

  return chartId;
}

export function groupedBarSort(chartId, op) {
  const svg = d3.select(`#${chartId} svg:last-of-type`);
  if (svg.empty()) return chartId;

  const orientation    = getOrientation(svg); // "horizontal" 또는 "vertical"
  const { left: mL, top: mT, right: mR, bottom: mB } = getMargins(svg);
  const {
    keyField:      facetField,    // 그룹 키 필드
    subgroupField,                 // subgroup 필드
    subgroupKey,                   // subgroup 키값
    field:          valueField,    // 값 필드
    order = "ascending",
    limit                           // 강조할 상위 개수
  } = op;

  const sortFn         = order === "descending" ? d3.descending : d3.ascending;
  const highlightColor = "#00e676";
  const fadeDur        = 800;

  // 1) non-subgroup bars 페이드아웃 후 제거
  svg.selectAll("rect")
    .filter(d => d && String(d[subgroupField]) !== subgroupKey)
    .transition().duration(fadeDur)
      .attr("opacity", 0)
    .remove();

  // 2) fadeDur + 100ms 후 정렬 실행
  setTimeout(() => {
    // a) subgroupKey가 포함된 그룹(<g>)들만 선택
    const groups = svg.selectAll("g").filter(function() {
      const grp = d3.select(this);
      return grp.selectAll("rect")
        .filter(d => d && String(d[subgroupField]) === subgroupKey)
        .size() > 0;
    });

    // b) 그룹별 facet 키와 값 수집
    const facets = groups.nodes().map(node => {
      const grp = d3.select(node);
      const key = grp.select("text").text();
      const bar = grp.selectAll("rect")
        .filter(d => d && String(d[subgroupField]) === subgroupKey);
      return { node, key, value: bar.datum()[valueField] };
    });
    if (!facets.length) return;

    // c) 값 기준으로 정렬
    facets.sort((a,b) => sortFn(a.value, b.value));

    // d) 차트 영역 크기 계산
    const fullW = +svg.attr("width"), fullH = +svg.attr("height");
    const margin = { left: mL, right: mR, top: mT, bottom: mB };
    const plotW  = fullW - margin.left - margin.right;
    const plotH  = fullH - margin.top - margin.bottom;

    if (orientation === "vertical") {
      // vertical: x축 재생성 & 그룹 수평 이동
      const x0 = d3.scaleBand()
        .domain(facets.map(f => f.key))
        .range([margin.left, margin.left + plotW])
        .padding(0.2);

      // 기존 x축 제거
      svg.selectAll("g")
        .filter(function() {
          return d3.select(this).attr("transform") ===
            `translate(0,${margin.top + plotH})`;
        })
        .remove();

      // 새로운 x축 추가
      svg.append("g")
        .attr("transform", `translate(0,${margin.top + plotH})`)
        .call(d3.axisBottom(x0).tickFormat(d => d));

      // 그룹 <g>를 x축 위치로 이동
      facets.forEach(f => {
        d3.select(f.node).raise()
          .transition().duration(800)
          .attr("transform", `translate(${x0(f.key)},0)`);
      });
    } else {
      // horizontal: y축 재생성 & 그룹 수직 이동
      const y0 = d3.scaleBand()
        .domain(facets.map(f => f.key))
        .range([margin.top, margin.top + plotH])
        .padding(0.2);

      // 기존 y축 제거
      svg.selectAll("g")
        .filter(function() {
          return d3.select(this).attr("transform") ===
            `translate(${margin.left},0)`;
        })
        .remove();

      // 새로운 y축 추가
      svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y0).tickFormat(d => d));

      // 그룹 <g>를 y축 위치로 이동
      facets.forEach(f => {
        d3.select(f.node).raise()
          .transition().duration(800)
          .attr("transform", `translate(0,${y0(f.key)})`);
      });
    }

    // e) 상위 limit 개 그룹 강조 테두리
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