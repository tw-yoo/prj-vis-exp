import {OperationType} from "../../../object/operationType.js";
import {
    simpleLineCompare,
    simpleLineDetermineRange,
    simpleLineFilter,
    simpleLineFindExtremum,
    simpleLineRetrieveValue,
    simpleLineSort
} from "./simpleLineFunctions.js";

export async function runSimpleLineOps(chartId, opsSpec) {
    for (const operation of opsSpec.ops) {
        switch (operation.op) {
            case OperationType.RETRIEVE_VALUE:
                simpleLineRetrieveValue(chartId, operation);
                break;
            case OperationType.FILTER:
                simpleLineFilter(chartId, operation);
                break;
            case OperationType.FIND_EXTREMUM:
                simpleLineFindExtremum(chartId, operation);
                break;
            case OperationType.DETERMINE_RANGE:
                simpleLineDetermineRange(chartId, operation);
                break;
            case OperationType.COMPARE:
                simpleLineCompare(chartId, operation);
                break;
            case OperationType.SORT:
                simpleLineSort(chartId, operation);
                break;
            default:
                console.warn("Not supported operation", operation.op);
        }
    }
}
export async function renderSimpleLineChart(chartId, spec) {
  const host = d3.select(`#${chartId}`);
  host.selectAll('*').remove();

  const width  = 1200;
  const height = 800;
  const margin = { top: 40, right: 120, bottom: 50, left: 60 };

  const xField     = spec.encoding.x.field;
  const yField     = spec.encoding.y.field;
  const colorField = spec.encoding.color?.field;

  const parseTime  = d3.timeParse('%b %d %Y');
  const formatId   = d3.timeFormat('%Y-%m-%d');

  let data = await d3.csv(spec.data.url, d => {
    d[xField] = spec.encoding.x.type === 'temporal' ? parseTime(d[xField]) : d[xField];
    d[yField] = +d[yField];
    return d;
  });

  if (Array.isArray(spec.transform)) {
    spec.transform.forEach(tr => {
      const m = String(tr.filter || '').match(/datum\.(\w+)\s*===\s*'([^']+)'/);
      if (m) {
        const [, f, val] = m;
        data = data.filter(r => String(r[f]) === val);
      }
    });
  }

  const series = colorField
    ? Array.from(d3.group(data, d => d[colorField]), ([key, values]) => ({ key, values }))
    : [{ key: yField, values: data }];

  const plotW = width  - margin.left - margin.right;
  const plotH = height - margin.top  - margin.bottom;

  const svg = host.append('svg')
    .attr('width',  width)
    .attr('height', height)
    .attr('data-m-left',  margin.left)
    .attr('data-m-top',   margin.top)
    .attr('data-plot-w',  plotW)
    .attr('data-plot-h',  plotH)
    .attr('data-y-domain-max', d3.max(data, d => d[yField]))
    .attr('data-x-field', xField)
    .attr('data-y-field', yField);

  const xScale = spec.encoding.x.type === 'temporal'
    ? d3.scaleTime().domain(d3.extent(data, d => d[xField])).range([margin.left, width - margin.right])
    : d3.scalePoint().domain([...new Set(data.map(d => d[xField]))]).range([margin.left, width - margin.right]);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(data, d => d[yField])]).nice()
    .range([height - margin.bottom, margin.top]);

  svg.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(xScale));

  svg.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(yScale));

  const color = d3.scaleOrdinal(d3.schemeCategory10).domain(series.map(s => s.key));
  const line  = d3.line().x(d => xScale(d[xField])).y(d => yScale(d[yField]));

  series.forEach(s => {
    svg.append('path')
      .datum(s.values)
      .attr('fill', 'none')
      .attr('stroke', color(s.key))
      .attr('stroke-width', 2)
      .attr('d', line);
  });

  svg.append('g')
    .selectAll('circle.point')
    .data(data)
    .join('circle')
      .attr('class', 'point')
      .attr('cx', d => xScale(d[xField]))
      .attr('cy', d => yScale(d[yField]))
      .attr('r', 4)
      .attr('fill', '#69b3a2')
      .attr('data-id', d => spec.encoding.x.type === 'temporal' ? formatId(d[xField]) : d[xField])
      .attr('data-value', d => d[yField]);

  if (series.length > 1) {
    const legend = svg.append('g')
      .attr('transform', `translate(${width - margin.right + 20}, ${margin.top})`);

    legend.append('text')
      .attr('y', -10)
      .attr('font-weight', 'bold')
      .text(colorField);

    series.forEach((s, i) => {
      const g = legend.append('g').attr('transform', `translate(0, ${i * 20})`);
      g.append('rect').attr('width', 12).attr('height', 12).attr('fill', color(s.key));
      g.append('text').attr('x', 16).attr('y', 10).attr('font-size', 10).text(s.key);
    });
  }
}
