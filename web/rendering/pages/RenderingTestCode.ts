import * as d3 from 'd3'
import {getChartContext} from "../../../src/rendering/common/d3Helpers.ts";

function tutorialNote(container: HTMLElement) {

    // 차트 컨텍스트 가져오기
    const { svg, g, margins, plot } = getChartContext(container)

    // 데이터 가져오기
    // 1. 모든 마크 선택
    const allMarks = d3
        .select(container)
        .select('svg')
        .selectAll<SVGElement, unknown>('rect, circle, path')

    // 2. data 속성으로 가져오기
    // 선택할 x 축 레이블
    const keys = new Set(['2011', '2018']) // 가져오고 싶은 것
    const selected = svg
        .selectAll<SVGElement, unknown>('rect')
        . filter(
            function(this: SVGElement) {
                const target = this.getAttribute('data-target')
                const id = this.getAttribute('data-id')
                return !!(target && keys.has(target)) || !! (id && keys.has(id))
            }
        )

    // 선택한 것 색 바꾸기
    selected
        .attr('fill','red')

    // 선택한 바 1개의 좌표를 구해서, 바의 위쪽 가운데에 원을 그린다.
    const oneBar = selected.nodes()[0]

    const x = Number(oneBar.getAttribute('x') ?? 0)
    const y = Number(oneBar.getAttribute('y') ?? 0)
    const width = Number(oneBar.getAttribute('width') ?? 0)
    const cx = width/2 + x // x + width / 2
    const cy = y // y - 6

    d3.select(oneBar.parentNode as SVGGElement)
        .append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', 5)
        .attr('fill', 'red')




    // 바 차트에서 바 선택하기
}

export function buttonClickAction(container: HTMLElement) {
    tutorialNote(container)
}
