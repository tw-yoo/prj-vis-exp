"""
Generates system architecture PDF for the chart QA visual explanation system.
Run: python3 generate_system_doc.py
Output: system_architecture.pdf (Desktop)
"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, PageBreak
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── Fonts ──────────────────────────────────────────────────────────────────
TTC_PATH = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
pdfmetrics.registerFont(TTFont('KR', TTC_PATH, subfontIndex=0))        # Regular
pdfmetrics.registerFont(TTFont('KR-Bold', TTC_PATH, subfontIndex=6))   # Bold
pdfmetrics.registerFont(TTFont('KR-Light', TTC_PATH, subfontIndex=8))  # Light

# ── Colors ─────────────────────────────────────────────────────────────────
C_BLUE   = colors.HexColor('#3b82f6')
C_INDIGO = colors.HexColor('#6366f1')
C_GRAY   = colors.HexColor('#6b7280')
C_LIGHT  = colors.HexColor('#f3f4f6')
C_BORDER = colors.HexColor('#d1d5db')
C_CODE   = colors.HexColor('#1e293b')
C_CODEBG = colors.HexColor('#f8fafc')
C_GREEN  = colors.HexColor('#16a34a')

W, H = A4

# ── Styles ─────────────────────────────────────────────────────────────────
def make_styles():
    s = {}

    s['title'] = ParagraphStyle(
        'title', fontName='KR-Bold', fontSize=20, leading=28,
        textColor=colors.HexColor('#111827'), spaceAfter=6,
    )
    s['subtitle'] = ParagraphStyle(
        'subtitle', fontName='KR', fontSize=12, leading=18,
        textColor=C_GRAY, spaceAfter=20,
    )
    s['section'] = ParagraphStyle(
        'section', fontName='KR-Bold', fontSize=14, leading=20,
        textColor=C_BLUE, spaceBefore=18, spaceAfter=6,
        borderPad=4,
    )
    s['subsection'] = ParagraphStyle(
        'subsection', fontName='KR-Bold', fontSize=11, leading=16,
        textColor=colors.HexColor('#1f2937'), spaceBefore=12, spaceAfter=4,
    )
    s['body'] = ParagraphStyle(
        'body', fontName='KR', fontSize=10, leading=16,
        textColor=colors.HexColor('#374151'), spaceAfter=6,
    )
    s['code'] = ParagraphStyle(
        'code', fontName='KR-Light', fontSize=8.5, leading=13,
        textColor=C_CODE, spaceAfter=4,
        leftIndent=10, rightIndent=10,
        backColor=C_CODEBG,
        borderColor=C_BORDER, borderWidth=0.5, borderPad=6,
        borderRadius=3,
    )
    s['bullet'] = ParagraphStyle(
        'bullet', fontName='KR', fontSize=10, leading=15,
        textColor=colors.HexColor('#374151'), spaceAfter=3,
        leftIndent=14, bulletIndent=4,
    )
    s['note'] = ParagraphStyle(
        'note', fontName='KR', fontSize=9, leading=14,
        textColor=C_GRAY, spaceAfter=4, leftIndent=10,
    )
    s['footer'] = ParagraphStyle(
        'footer', fontName='KR', fontSize=8, leading=12,
        textColor=C_GRAY, alignment=1,
    )
    return s

ST = make_styles()


def sec(title, letter):
    return [
        HRFlowable(width='100%', thickness=1.5, color=C_BLUE, spaceAfter=4),
        Paragraph(f'{letter}. {title}', ST['section']),
    ]

def sub(label):
    return Paragraph(label, ST['subsection'])

def body(text):
    return Paragraph(text, ST['body'])

def code(text):
    # escape XML special chars
    text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return Paragraph(text, ST['code'])

def bullet(text):
    return Paragraph(f'• {text}', ST['bullet'])

def sp(n=6):
    return Spacer(1, n)

def note(text):
    return Paragraph(text, ST['note'])


# ── Page template ──────────────────────────────────────────────────────────
def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont('KR', 8)
    canvas.setFillColor(C_GRAY)
    canvas.drawString(2*cm, 1.2*cm, 'Chart QA Visual Explanation System — Architecture')
    canvas.drawRightString(W - 2*cm, 1.2*cm, f'Page {doc.page}')
    canvas.restoreState()


# ── Table helper ───────────────────────────────────────────────────────────
def make_table(data, col_widths=None, header=True):
    tbl = Table(data, colWidths=col_widths, repeatRows=1 if header else 0)
    style = [
        ('FONTNAME',  (0,0), (-1,0),  'KR-Bold'),
        ('FONTSIZE',  (0,0), (-1,-1), 9),
        ('FONTNAME',  (0,1), (-1,-1), 'KR'),
        ('LEADING',   (0,0), (-1,-1), 14),
        ('BACKGROUND',(0,0), (-1,0),  C_LIGHT),
        ('TEXTCOLOR', (0,0), (-1,0),  colors.HexColor('#1f2937')),
        ('GRID',      (0,0), (-1,-1), 0.4, C_BORDER),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#fafafa')]),
        ('VALIGN',    (0,0), (-1,-1), 'MIDDLE'),
        ('PADDING',   (0,0), (-1,-1), 5),
    ]
    tbl.setStyle(TableStyle(style))
    return tbl


# ── Content ────────────────────────────────────────────────────────────────
def build_content():
    story = []

    # Cover
    story += [
        sp(30),
        Paragraph('Chart QA Visual Explanation System', ST['title']),
        Paragraph('System Architecture — Paper Reference', ST['subtitle']),
        HRFlowable(width='100%', thickness=1, color=C_BORDER),
        sp(8),
        body('이 문서는 논문 System 섹션 작성을 위해 코드베이스를 직접 분석하여 작성한 시스템 구조 참조 문서입니다.'),
        body('각 항목은 실제 파일명·함수명을 인용합니다.'),
        sp(20),
        PageBreak(),
    ]

    # ── A ──────────────────────────────────────────────────────────────────
    story += sec('전체 파이프라인', 'A')

    story += [
        sub('A1. 입력과 출력'),
        body('<b>입력</b>'),
        bullet('Chart: Vega-Lite JSON spec (<font name="KR-Light">ChartSpec</font> — <font name="KR-Light">src/domain/chart/types.ts</font>)'),
        bullet('Question / Explanation: 자연어 텍스트'),
        bullet('Data: CSV 또는 spec 내 inline values → <font name="KR-Light">DatumValue[]</font> 배열'),
        sp(4),
        body('<b>출력</b>'),
        bullet('SVG 차트 위에 D3로 직접 그린 annotation (reference line, vertical arrow, opacity 변화, 값 라벨)'),
        bullet('각 step 실행 후 <font name="KR-Light">OperationNextRunOutcome</font> 반환:'),
        code('{ result: DatumValue[], continuation: SerializableChainState, runtimeSnapshot }\n'
             '// src/operation-next/executionState.ts'),
        sp(6),

        sub('A2. 입력 → 출력까지 주요 단계'),
        make_table(
            [
                ['단계', '담당 모듈'],
                ['자연어 explanation → OpsSpec (LLM)', 'nlp_server/main.py  POST /generate_grammar'],
                ['OpsSpec 정규화 (그룹 분리)', 'src/domain/operation/opsSpec.ts  normalizeOpsGroups()'],
                ['chart-type dispatch (render)', 'src/rendering/renderChart.ts'],
                ['ChartInstance 생성 + SVG 초기 렌더링', 'src/rendering-new/instances/{chartType}Instance.ts'],
                ['chart-type dispatch (ops)', 'src/operation-next/runChartOps.ts'],
                ['그룹별 runner 실행', 'src/operation-next/runners/ 또는 src/operation-new/'],
                ['op별 Applier — 계산 + annotation', 'src/operation-new/appliers/{chartType}/'],
                ['annotation primitives — SVG에 그리기', 'src/operation-next/primitives/'],
            ],
            col_widths=[7*cm, 10*cm],
        ),
        sp(6),

        sub('A3. 자연어 → 내부 표현 변환'),
        body('<b>LLM 기반</b>, Python FastAPI 서버 (<font name="KR-Light">nlp_server/</font>). 두 단계:'),
        bullet('<b>Module A — Inventory</b> (<font name="KR-Light">nlp_server/opsspec/modules/module_inventory.py</font>): '
               'explanation 전체를 LLM에 보내 필요한 operation task 목록 추출. '
               '프롬프트: <font name="KR-Light">nlp_server/prompts/opsspec_inventory.md</font>'),
        bullet('<b>Module B — Step-Compose</b> (<font name="KR-Light">module_step_compose.py</font>): '
               'task 하나씩 LLM → op_spec + inputs 제안 → 결정론적 grounding '
               '(<font name="KR-Light">runtime/grounding.py</font>: 토큰 정규화, 값 fuzzy match) → '
               'contract 검증 → 실제 실행 → 다음 task. 반복 루프.'),
        sp(4),
        body('<b>입력:</b> { question, explanation_text, chart_spec, data_rows }'),
        body('<b>출력:</b> OpsSpec JSON — <font name="KR-Light">{ ops: [...], ops2: [...] }</font> 형식의 DAG.'),
        body('ref 문자열은 <font name="KR-Light">"ref:n1"</font> 형태만 사용. id/meta는 pipeline이 결정론적으로 부착.'),
        sp(10),
    ]

    # ── B ──────────────────────────────────────────────────────────────────
    story += sec('Explanation의 내부 표현 (의존 구조)', 'B')

    story += [
        sub('B1. 자료구조 — OperationSpec 배열 + meta.inputs 참조'),
        body('<font name="KR-Light">src/domain/operation/types/operationSpecs.ts</font>에 정의된 '
             '<font name="KR-Light">OperationSpec</font> 객체들의 ordered list. '
             '각 노드는 op 종류, id, meta.inputs (상위 노드 id 목록), '
             'targetA/targetB 필드의 "ref:nX" 참조로 의존 관계를 표현합니다.'),
        code('{\n'
             '  op: "diff",\n'
             '  id: "n3",\n'
             '  meta: { nodeId: "n3", inputs: ["n1", "n2"], sentenceIndex: 2 },\n'
             '  targetA: "ref:n1",   // n1 op의 결과를 입력으로\n'
             '  targetB: "ref:n2"    // n2 op의 결과를 입력으로\n'
             '}'),
        body('실행 시 <font name="KR-Light">stateWithOperationDependencies()</font> '
             '(<font name="KR-Light">src/operation-next/executionState.ts</font>)가 '
             'ref를 runtimeSnapshot에서 resolve해 workingData로 주입합니다.'),
        sp(6),

        sub('B2. DAG (일반 그래프) — fan-out 가능'),
        body('선형 리스트가 아닙니다. 한 노드의 결과("ref:n2")가 여러 후속 노드의 '
             'targetA, targetB에 동시에 나타날 수 있어 fan-out을 표현합니다.'),
        body('이를 가능하게 하는 코드: <font name="KR-Light">src/operation-next/diffEndpoint.ts</font>의 '
             '<font name="KR-Light">collectReferencedResultIds(groups)</font> — '
             '모든 op의 targetA/B/value 필드를 스캔해 "ref:nX" 패턴 수집. '
             '참조된 결과는 <font name="KR-Light">RESULT_REF_ATTRIBUTE = \'data-operation-result-ref\'</font> '
             'SVG 속성으로 annotation DOM에 태깅되어 후속 op이 재사용합니다.'),
        body('그룹 구조 (ops, ops2, ...): <font name="KR-Light">normalizeOpsGroups()</font> '
             '(<font name="KR-Light">src/domain/operation/opsSpec.ts</font>)가 '
             'OpsSpecGroupMap을 순서 있는 NormalizedOpsGroup[]으로 변환. '
             '그룹 = 한 문장에 대응하는 step 묶음.'),
        sp(6),

        sub('B3. Atomic Operation 목록'),
        body('정의 위치: <font name="KR-Light">src/domain/operation/types/operationNames.ts</font> '
             '및 각 OperationSpec 인터페이스'),
        sp(4),
        make_table(
            [
                ['Operation', '입력', '출력'],
                ['retrieveValue', 'target 이름', '해당 datum (DatumValue[])'],
                ['filter', 'field + operator / include / exclude', '필터된 subset (DatumValue[])'],
                ['findExtremum', 'which: "max" | "min"', '극값 datum'],
                ['nth', 'order, n', 'n번째 datum'],
                ['sort', 'field, order', '정렬된 배열'],
                ['average', '(workingData 전체)', '평균값 datum'],
                ['sum', '(workingData 전체)', '합계 datum'],
                ['count', '(workingData 전체)', '개수 datum'],
                ['range', '(workingData 전체)', '[min, max]'],
                ['diff', 'targetA, targetB (또는 ref)', '차이값 datum'],
                ['diffByValue', 'value threshold', '필터 결과'],
                ['lagDiff', 'orderField', '인접 항 차이 배열'],
                ['pairDiff', 'groupA, groupB', '두 그룹 차이'],
                ['add', 'targetA, targetB', '합산값'],
                ['scale', 'value (배율)', '스케일된 값'],
                ['compareBool', 'targetA, targetB, operator', 'boolean 결과'],
            ],
            col_widths=[4.5*cm, 6.5*cm, 6*cm],
        ),
        sp(10),
    ]

    # ── C ──────────────────────────────────────────────────────────────────
    story += sec('개별 Step의 렌더링', 'C')

    story += [
        sub('C1. 차트 변형 (axis rescale) 로직'),
        body('각 applier가 직접 호출합니다. filter applier '
             '(<font name="KR-Light">src/operation-new/appliers/simpleLine/filter.ts</font>) 예시:'),
        code('1단계: markSalience(salienceMap) → 범위 밖 점들 opacity=0.2 (dim)\n'
             '2단계: instance.transitionChartScale({ yDomain, xDomain, outOfScopeOpacity: 0 })\n'
             '       → 축 도메인 변경 + 점 재배치 + 범위 밖 marks 사라짐 (하나의 D3 shared transition)'),
        body('<font name="KR-Light">transitionChartScale()</font> — '
             '<font name="KR-Light">src/rendering-new/chartInstance.ts</font>. '
             '하나의 D3 transition이 axis ticks + mark positions + persistent ref-lines를 동기화. '
             'ref-line은 <font name="KR-Light">REF_LINE_ANCHOR_VALUE_ATTR</font>에 저장된 값으로 '
             'yScale 재계산해 y 위치 이동.'),
        sp(6),

        sub('C2. Annotation 단위 — 재사용 가능한 primitive 함수들'),
        body('위치: <font name="KR-Light">src/operation-next/primitives/</font>'),
        make_table(
            [
                ['Primitive 파일', '역할'],
                ['drawReferenceLine.ts', '수평 reference line + 값 라벨 (average, filter threshold)'],
                ['drawDifferenceArrow.ts', 'drawVerticalComparisonArrow(): 이중 화살표 (diff)\ndrawDirectionalArrow(): 단방향 화살표 (lagDiff, pairDiff)'],
                ['markSalience.ts', 'applyMarkSalience(): opacity 전환 (chart-agnostic, isInScope() predicate)'],
                ['annotationLayer.ts', 'ensureAnnotationLayer(svg): 마크 위 고정 <g> 레이어 보장'],
                ['placeLabel.ts / placeValueLabel.ts', '텍스트 배치, 충돌 회피'],
                ['fadeRemove.ts', 'annotation class 제거 시 fade-out 애니메이션'],
            ],
            col_widths=[5.5*cm, 11.5*cm],
        ),
        sp(6),

        sub('C3. Highlight / Fade 처리'),
        body('<b>별도 모듈로 분리</b>: '
             '<font name="KR-Light">src/operation-next/primitives/markSalience.ts</font>'),
        body('<font name="KR-Light">ChainState.salienceMap: Map&lt;string, number&gt;</font> '
             '(target → opacity)이 상태를 유지. '
             'Applier가 filter 후 salienceMap을 업데이트하면, '
             '<font name="KR-Light">applyMarkSalience()</font> 호출 시 DOM에 반영. '
             'salienceMap.size > 0이면 "filter context 있음" 판단 '
             '(average applier가 "(filtered)" 라벨 추가 여부 결정에 사용).'),
        body('Annotation 간 dimming: <font name="KR-Light">applyAnnotationContextTransitions()</font> — '
             '새 op 시작 시 기존 annotation을 dashed/context 스타일로 fade.'),
        sp(6),

        sub('C4. 계산과 렌더링 분리'),
        body('<b>분리되어 있습니다.</b>'),
        bullet('<b>계산 레이어</b>: <font name="KR-Light">src/domain/operation/dataOps.ts</font> — '
               'filterData(), averageData(), diffData(), lagDiffOp() 등 pure 함수. DOM 없음.'),
        bullet('<b>렌더링 레이어</b>: 각 applier 파일 — 계산 결과를 받아 annotation primitives 호출.'),
        sp(4),
        body('Applier 내부 패턴:'),
        code('// 계산 (pure, DOM 없음)\n'
             'const result = averageData(state.workingData, ...)  // dataOps.ts\n\n'
             '// 렌더링 (D3 + SVG)\n'
             'await drawReferenceLine({ layer, y: yScale(result.value), ... })\n\n'
             '// 상태 반환\n'
             'return { result, nextState: { ...state, lastResult: result } }'),
        sp(10),
    ]

    # ── D ──────────────────────────────────────────────────────────────────
    story += sec('Step들의 합성 (의존 구조를 따라 전개)', 'D')

    story += [
        sub('D1. ChainState 전달 메커니즘'),
        body('<font name="KR-Light">ChainState</font> 객체가 op-to-op으로 명시적으로 전달됩니다 '
             '(<font name="KR-Light">src/operation-next/chainState.ts</font>).'),
        make_table(
            [
                ['ChainState 필드', '역할'],
                ['workingData', 'filter op 이후 subset이 다음 op의 입력 데이터'],
                ['annotationRecords[]', '이전 step이 그린 annotation 목록 (다음 op의 재사용 여부 결정)'],
                ['scaleState', '현재 y축 도메인 (axis 변형 이후 지속)'],
                ['salienceMap', '누적 opacity 상태'],
            ],
            col_widths=[5.5*cm, 11.5*cm],
        ),
        sp(4),
        body('<b>그룹 경계</b> (<font name="KR-Light">clearGroupBoundary()</font>): '
             'derivedData, salienceMap, annotationRecords, scaleState는 리셋. '
             'workingData와 filterContext는 유지 (문장 간 filter 효과 지속).'),
        body('<b>substep 간 직렬화</b>: '
             '<font name="KR-Light">serializeChainState()</font> / '
             '<font name="KR-Light">restoreChainState()</font> '
             '(<font name="KR-Light">src/operation-next/executionState.ts</font>)로 '
             'workbench가 substep 결과를 JSON으로 보존했다가 다음 substep에 '
             '<font name="KR-Light">initialChainState</font> 옵션으로 전달.'),
        sp(6),

        sub('D2. Side-by-side View (Split Layout)'),
        body('<b>구현됨.</b> '
             '<font name="KR-Light">src/api/visual-execution-player.ts</font>의 '
             '<font name="KR-Light">VisualExecutionSubstep</font>에 '
             '<font name="KR-Light">surface.surfaceAction: "split"</font> 타입 존재. '
             '<font name="KR-Light">src/operation-next/splitSurfaceVisuals.ts</font>가 '
             'multi-surface 렌더링과 cross-surface y축 정렬 '
             '(<font name="KR-Light">applySplitSharedYAxisPolicy</font>)을 담당. '
             'pairDiff 같은 두 그룹 비교 op에서 사용.'),
        sp(6),

        sub('D3. Fan-out — 한 결과를 여러 step이 공유'),
        body('<font name="KR-Light">src/operation-next/diffEndpoint.ts</font>의 '
             '<font name="KR-Light">isOperationResultReferenced()</font> + '
             '<font name="KR-Light">RESULT_REF_ATTRIBUTE</font>.'),
        body('실행 시: 한 op의 결과가 runtimeSnapshot에 operationId → DatumValue[]로 저장. '
             '후속 op이 "ref:n1"을 참조하면 stateWithOperationDependencies()가 snapshot에서 꺼내 workingData로 주입. '
             '시각적으로는 RESULT_REF_ATTRIBUTE 태그가 붙은 annotation DOM 엘리먼트가 삭제되지 않고 유지됨.'),
        sp(6),

        sub('D4. 비동기 처리 (async / Promise)'),
        body('<b>비동기.</b> 이유: D3 transition이 비동기 '
             '(<font name="KR-Light">transition.end()</font> → Promise). '
             'Annotation을 그리기 전에 axis rescale animation이 완료되어야 정확한 geometry를 읽을 수 있기 때문.'),
        body('순서 보장 패턴:'),
        code('await applyMarkSalience(...)           // opacity 전환 완료 대기\n'
             'await instance.transitionChartScale(...)  // axis + mark 위치 전환 완료 대기\n'
             'await drawReferenceLine(...)            // 이후 정확한 y좌표로 annotation 배치'),
        body('병렬 가능한 경우 <font name="KR-Light">Promise.all([...])</font> 사용 '
             '(예: 여러 ref-line 동시 transition).'),
        sp(10),
    ]

    # ── E ──────────────────────────────────────────────────────────────────
    story += sec('마무리 단계', 'E')

    story += [
        sub('E1. 최종 결론 처리'),
        body('별도로 지정된 "conclusion" 렌더링 단계는 없습니다. '
             '마지막 op의 annotation이 그대로 남아 결론을 표시합니다.'),
        body('<b>Fan-out을 통한 결과 재참조</b>: diff op이 이전 average 두 개를 '
             '"ref:n1", "ref:n2"로 참조하면, 해당 reference lines가 삭제되지 않고 '
             '화살표의 양 끝점이 됩니다. '
             '<font name="KR-Light">referencedResultIds</font> / '
             '<font name="KR-Light">futureReferencedResultIds</font> 옵션 '
             '(<font name="KR-Light">runChartOps</font> options)으로 어떤 결과를 살려둘지 미리 선언.'),
        body('<font name="KR-Light">src/api/operation-summary-text.ts</font>가 각 op 결과로부터 '
             '텍스트 요약을 자동 생성 (시각적 annotation이 실패할 경우 fallback).'),
        sp(10),
    ]

    # ── F ──────────────────────────────────────────────────────────────────
    story += sec('기술 스택', 'F')

    story += [
        sub('F1. 주요 라이브러리 / 프레임워크'),
        make_table(
            [
                ['역할', '라이브러리 / 기술'],
                ['차트 렌더링', 'D3.js (scale, axis, transition, selection)'],
                ['차트 spec 포맷', 'Vega-Lite JSON (→ D3로 직접 구현, Vega runtime 미사용)'],
                ['UI 프레임워크', 'React + TypeScript (Vite 번들)'],
                ['NLP / LLM 파이프라인', 'FastAPI (Python) + Claude LLM API'],
                ['비동기 제어', 'Promise / async-await (D3 transition.end())'],
                ['e2e 테스트', 'Playwright'],
                ['상태 관리', '없음 — ChainState가 plain object로 명시적 전달'],
            ],
            col_widths=[5*cm, 12*cm],
        ),
        sp(10),

        sub('F2. 시스템 컴포넌트 구조 (배치 순서)'),
        sp(4),
    ]

    # Architecture diagram as table
    arch = [
        ['레이어', '컴포넌트', '파일'],
        ['① 입력',
         'ChartSpec (Vega-Lite) +\nNL Explanation + DatumValue[]',
         'src/domain/chart/types.ts\nsrc/domain/operation/types/'],
        ['② NLP 서버',
         'Inventory → Step-Compose 루프\n(LLM + 결정론적 grounding)',
         'nlp_server/main.py\nnlp_server/opsspec/modules/'],
        ['③ OpsSpec',
         'JSON DAG\n{ ops:[…], ops2:[…], meta.inputs, ref:nX }',
         'src/domain/operation/types/operationSpecs.ts'],
        ['④ Dispatcher',
         'normalizeOpsGroups() →\nrenderChart() + runChartOps()',
         'src/domain/operation/opsSpec.ts\nsrc/rendering/renderChart.ts\nsrc/operation-next/runChartOps.ts'],
        ['⑤ ChartInstance',
         'stateful SVG +\nannotationLayer <g>',
         'src/rendering-new/instances/\nsrc/rendering-new/chartInstance.ts'],
        ['⑥ Applier',
         'dataOps (계산) +\nannotation primitives (그리기) +\nnextChainState 반환',
         'src/operation-new/appliers/{chartType}/\nsrc/domain/operation/dataOps.ts'],
        ['⑦ ChainState',
         'workingData, salienceMap,\nannotationRecords, scaleState, filterContext',
         'src/operation-next/chainState.ts'],
        ['⑧ Primitives',
         'drawReferenceLine, drawDifferenceArrow,\nmarkSalience, annotationLayer, …',
         'src/operation-next/primitives/'],
        ['⑨ 출력',
         'Annotated SVG + OperationNextRunOutcome\n(multi-sentence: VisualExecutionPlayer)',
         'src/api/visual-execution-player.ts\nsrc/operation-next/executionState.ts'],
    ]
    story.append(make_table(arch, col_widths=[2.2*cm, 6.8*cm, 8*cm]))
    story.append(sp(10))

    # Supplementary notes
    story += [
        HRFlowable(width='100%', thickness=0.5, color=C_BORDER, spaceAfter=6),
        Paragraph('보완 메모 (코드에서 직접 확인한 것)', ST['subsection']),
        bullet('<b>B2 보충 — 그룹 경계가 DAG의 "문장 레벨" 분리:</b> '
               'ops, ops2, ops3… 각 그룹이 자연어의 한 문장에 대응. '
               '그룹 내부의 노드들이 meta.inputs으로 DAG를 이루고, '
               '그룹 간에는 "ref:nX"로만 cross-reference.'),
        bullet('<b>D4 보충 — 비동기인 이유:</b> '
               'instance.transitionChartScale()이 완료되어야 수직 좌표가 확정됨. '
               'D3 .transition().end()가 Promise 반환. '
               'Reference line의 y-좌표를 axis transition 완료 후에 계산해야 '
               'axis jitter 없이 정확한 위치에 annotation을 놓을 수 있음.'),
        bullet('<b>E1 보충 — 결론 표시 방식:</b> '
               '마지막 op에서 referencedResultIds에 포함된 annotation은 '
               'RESULT_REF_ATTRIBUTE로 태깅되어 clear되지 않음. '
               'diff 화살표가 그려질 때 참조된 average lines 두 개가 동시에 화면에 남아, '
               '최종 비교 장면을 자동으로 구성.'),
        sp(20),
    ]

    return story


# ── Build ──────────────────────────────────────────────────────────────────
OUT = os.path.expanduser('~/Desktop/system_architecture.pdf')

doc = SimpleDocTemplate(
    OUT,
    pagesize=A4,
    leftMargin=2*cm, rightMargin=2*cm,
    topMargin=2.2*cm, bottomMargin=2.2*cm,
    title='Chart QA Visual Explanation System — Architecture',
    author='Taewon Yoo',
)

doc.build(build_content(), onFirstPage=on_page, onLaterPages=on_page)
print(f'PDF saved: {OUT}')
