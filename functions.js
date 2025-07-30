
// import embed from 'vega-embed';
import {renderChart} from "./util/util.js";

const embed = window.vegaEmbed;

// DEPRECATED
export function opsRetrieveValue(vlSpec, field, keyField, key, printText=true) {


    return

    // 1) bar <path> 요소 선택
    const barPaths = d3.selectAll('#chart svg path[role="graphics-symbol"]');
    if (barPaths.empty()) {
        console.warn(`No bar elements found for selector.`);
        return Promise.resolve();
    }
    const dataArray = barPaths.data();
    const nodes = barPaths.nodes();

    let targetIdx;
    let targetValue = Infinity;
    dataArray.forEach((d, idx) => {
        const value = parseFloat(d.datum[keyField]);
        if (value === key) {
            targetValue = value;
            targetIdx = idx;
        }
    });

    if (targetIdx == null) {
        console.warn(`No target bar found.`);
        return Promise.resolve();
    }

    const targetNode = nodes[targetIdx];
    // const bbox = targetNode.getBBox();
    const targetLabel = d3.select(targetNode).datum().datum[keyField];


    // Highlight axis label for the matching key
    const targetAxis = d3.selectAll('#chart svg text')
        .filter(function() {
            return d3.select(this).text() === String(key);
        });

    // First highlight the axis label, then highlight the bar
    const matchingBar = d3.selectAll('#chart svg path[role="graphics-symbol"]')
        .filter(function(d) {
            return d.datum[keyField] === key;
        });

    const svgNode = d3.select(`#chart svg`).node();
    const bgNode = document.querySelector(
        '#chart svg path.background[aria-hidden="true"]'
    );
    if (!bgNode) throw new Error('Background frame not found');
    const bgBox = bgNode.getBBox();
    const bbox = targetNode.getBBox();


    const xDiff = svgNode.getBBox().width - bgBox.width
    const yDiff = svgNode.getBBox().height - bgBox.height

    const value = d3.select(targetNode).datum().datum[field];

    targetAxis.transition()
        .duration(500)
        .style('fill', 'red')
        .on('end', () => {
            matchingBar.transition()
                .duration(500)
                .attr('fill', 'red')
                .on('end', () => {

                    const startX = xDiff + bgBox.x + bbox.x + bbox.width / 2;
                    const startY = svgNode.getBBox().height - yDiff - bbox.height + 6;
                    const endX = xDiff + bgBox.x + 6;

                    d3.select(`#chart svg`)
                        .append('line')
                        .attr('x1', startX)
                        .attr('y1', startY)
                        .attr('x2', startX)
                        .attr('y2', startY)
                        .attr('stroke', 'red')
                        .attr('stroke-width', 2)
                        .style('opacity', 0)
                        .transition().duration(200).style('opacity', 1)
                        .transition().duration(1000)
                        .attr('x1', endX)
                        .attr('y1', startY)
                        .on('end', () => {


                            d3.select(`#chart svg`)
                                .append('text')
                                .text(value)
                                .attr('x', startX)
                                .attr('y', startY - 5)
                                .attr('text-anchor', 'middle')
                                .style('opacity', 0)
                                .transition().duration(200).style('opacity', 1);
                        })
                });
        });

    return value;
}

export function opsFilter(vlSpec, field, operator, value) {
    return new Promise((resolve, reject) => {
        // Select all bar paths
        const barPaths = d3.selectAll('#chart svg path[role="graphics-symbol"]');
        const dataArray = barPaths.data();
        const matchingBars = barPaths.filter(d => {
            const v = +d.datum[field];
            if (operator === '>') return v > value;
            else if (operator === '<') return v < value;
            else if (operator === '=') return v === value;
            return false;
        });

        const svgNode = d3.select(`#chart svg`).node();
        const bgNode = document.querySelector(
            '#chart svg path.background[aria-hidden="true"]'
        );
        const bgBBox = bgNode.getBBox();

        const xDiff = svgNode.getBBox().width - bgBBox.width
        const yDiff = svgNode.getBBox().height - bgBBox.height

        if (!bgNode) throw new Error('Background frame not found');
        const height = bgBBox.height;
        const y = d3.scaleLinear()
            .domain([0, d3.max(dataArray, d => +d.datum[field])])
            .nice()
            .range([height, 0]);

        const [yMin, yMax] = y.domain();
        // console.log("y‐axis min:", yMin, "max:", yMax);

        const filteredData = matchingBars.data().map(e => e.datum);

        const raw = vlEditor.getValue();

        // 2) Parse it into an object
        let vlSpec;
        try {
            vlSpec = JSON.parse(raw);
        } catch (e) {
            console.error("Failed to parse spec JSON:", e);
            return;
        }

        const newSpec = {
            ...vlSpec,
            data: {
                name: 'table',
                values: filteredData
            }
        };


        // 정확한 위치 계산 위해 필요한 기준:
        // x 축: svgNode.getBBox().width
        // y 축: bgBBox.height
        // d3.select('#chart svg')
        //     .append('circle')
        //     .attr('cx', svgNode.getBBox().width)
        //     .attr('cy', bgBBox.height)
        //     .attr('r', 5)



        d3.select('#chart svg')
            .append('line')
            .attr('x1', xDiff + 6)
            .attr('y1', bgBBox.height - bgBBox.height * parseFloat(value/(yMax-yMin))+6)
            .attr('x2', xDiff + 6)
            .attr('y2', bgBBox.height - bgBBox.height * parseFloat(value/(yMax-yMin))+6)
            .attr('stroke', 'red')
            .attr('stroke-width', 2)
            .style('opacity', 0)
            .transition()
            .duration(200)
            .style('opacity', 1)
            .attr('x2', xDiff + bgBBox.width + 6)
            .attr('y2', bgBBox.height - bgBBox.height * parseFloat(value/(yMax-yMin))+6)
            .on('end', () => {
                // Dim all bars, highlight matching ones
                barPaths.transition().duration(500).style('opacity', 0.2);
                matchingBars.transition().duration(500)
                    .style('opacity', 1)
                    .on('end', async () => {
                        await renderChart(newSpec);
                        resolve();

                    });
                d3.select('#ops-info-box')
                    .text(`Filter where the ${field}  ${operator} ${value}.`);
            });
    });
}

export function opsFindExtremum(vlSpec, field, which, printText=true) {
    // 1) bar <path> 요소 선택
    const barPaths = d3.selectAll('#chart svg path[role="graphics-symbol"]');
    if (barPaths.empty()) {
        console.warn(`No bar elements found for selector.`);
        return Promise.resolve();
    }

    const dataArray = barPaths.data();
    const nodes = barPaths.nodes();

    let targetIdx;
    if (which === 'min') {
        let minVal = Infinity;
        dataArray.forEach((d, idx) => {
            const value = parseFloat(d.datum[field]);
            if (value < minVal) {
                minVal = value;
                targetIdx = idx;
            }
        });
    } else if (which === 'max') {
        let maxVal = -Infinity;
        dataArray.forEach((d, idx) => {
            const value = parseFloat(d.datum[field]);
            if (value > maxVal) {
                maxVal = value;
                targetIdx = idx;
            }
        });
    }

    if (targetIdx == null) {
        console.warn(`No target bar found.`);
        return Promise.resolve();
    }

    const targetNode = nodes[targetIdx];
    // const bbox = targetNode.getBBox();
    const targetLabel = d3.select(targetNode).datum().datum[field];

    // First highlight the axis label, then highlight the bar
    const matchingBar = d3.selectAll('#chart svg path[role="graphics-symbol"]')
        .filter((d, i) => i === targetIdx);

    const svgNode = d3.select(`#chart svg`).node();
    const bgNode = document.querySelector(
        '#chart svg path.background[aria-hidden="true"]'
    );
    if (!bgNode) throw new Error('Background frame not found');
    const bgBox = bgNode.getBBox();
    const bbox = targetNode.getBBox();


    const xDiff = svgNode.getBBox().width - bgBox.width
    const yDiff = svgNode.getBBox().height - bgBox.height


    matchingBar.transition()
        .duration(500)
        .attr('fill', 'red')
        .on('end', () => {

            const startX = xDiff + bgBox.x + bbox.x + bbox.width / 2;
            const startY = svgNode.getBBox().height - yDiff - bbox.height + 6;
            const endX = xDiff + bgBox.x + 6;

            d3.select(`#chart svg`)
                .append('line')
                .attr('x1', startX)
                .attr('y1', startY)
                .attr('x2', startX)
                .attr('y2', startY)
                .attr('stroke', 'red')
                .attr('stroke-width', 2)
                .style('opacity', 0)
                .transition().duration(200).style('opacity', 1)
                .transition().duration(1000)
                .attr('x1', endX)
                .attr('y1', startY)
                .on('end', () => {

                    const value = d3.select(targetNode).datum().datum[field];
                    d3.select(`#chart svg`)
                        .append('text')
                        .text(value)
                        .attr('x', startX)
                        .attr('y', startY - 5)
                        .attr('text-anchor', 'middle')
                        .style('opacity', 0)
                        .transition().duration(200).style('opacity', 1);

                    if (printText) {
                        d3.select('#ops-info-box')
                            .text(`Find ${which} value on ${field}: ${value}`);
                    }
                });
        });

    return targetLabel;

}

export async function opsDetermineRange(vlSpec, field) {

    let minValue  = await opsFindExtremum(field, "min", false);
    let maxValue  = await opsFindExtremum(field, "max", false)

    await d3.select('#ops-info-box')
        .text(`${field} ranged from ${minValue} to ${maxValue}`)
}

function getText(field, leftValue, lv, rightValue, rv, operator) {

    if (operator === 'eq') {
        if (lv === rv) {
            return `The ${field} value of ${leftValue} (${lv}) is equal to the value of ${rightValue} (${rv})`;
        } else {return `${leftValue} is not equal to ${rightValue}`;}
    } else if (operator === 'gt') {
        if (lv > rv) {
            return `The ${field} value of ${leftValue} (${lv}) is greater than the value of ${rightValue} (${rv})`;
        } else {return `The ${field} value of ${leftValue} (${lv}) is not greater than the value of ${rightValue} (${rv})`;}
    } else if (operator === 'gte') {
        if (lv >= rv) {
            return `The ${field} value of ${leftValue} (${lv}) is greater than or equal to the value of ${rightValue} (${rv})`;
        } else {return `The ${field} value of ${leftValue} (${lv}) is not greater than or equal the value of ${rightValue} (${rv})`;}
    } else if (operator === 'lt') {
        if (lv > rv) {
            return `The ${field} value of ${leftValue} (${lv}) is less than the value of ${rightValue} (${rv})`;
        } else {return `The ${field} value of ${leftValue} (${lv}) is not less than the value of ${rightValue} (${rv})`;}
    } else if (operator === 'lte') {
        if (lv >= rv) {
            return `The ${field} value of ${leftValue} (${lv}) is less than or equal to the value of ${rightValue} (${rv})`;
        } else {return `The ${field} value of ${leftValue} (${lv}) is not less than or equal the value of ${rightValue} (${rv})`;}
    }
    // console.log("getText:", text);
    // return text;
}

export async function opsMakeComparisons(vlSpec, field, keyField, leftValue, operator, rightValue) {
    console.log(field, keyField, leftValue, operator, rightValue);
    let lv = await opsRetrieveValue(vlSpec, field, keyField, leftValue, false);
    let rv = await opsRetrieveValue(vlSpec, field, keyField, rightValue, false);

    console.log(lv);
    console.log(rv);

    const text = getText(field, leftValue, lv, rightValue, rv, operator);

    await d3.select('#ops-info-box')
        .text(text);
}

export function opsSort(vlSpec, keyField, valueField, sortField, order) {
    return new Promise((resolve, reject) => {

        const asc = (order === 'ascending');
        const values = Array.isArray(vlSpec.data.values)
            ? vlSpec.data.values.slice()
            : [];
        const sortedValues = values.sort((a, b) =>
            asc
                ? d3.ascending(a[sortField], b[sortField])
                : d3.descending(a[sortField], b[sortField])
        );

        const newSpec = {
            ...vlSpec,
            data: {
                ...vlSpec.data,
                values: sortedValues,
            }
        }

        const svg = d3.select('#chart svg')
            .transition().duration(500)
            .style('opacity', 0)
            .on('end', async function() {
                await renderChart(newSpec);
                d3.select('#ops-info-box')
                    .text(`Sorting by ${sortField} (${order})`);
                resolve();
            })

    });
}
