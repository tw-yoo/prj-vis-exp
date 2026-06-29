"""
Explanation Representation & System — paper reference PDF.
Code-grounded analysis of the OpsSpec (explanation specification) data model,
the Specification Generator (NL -> spec), and the Explanation Visualizer (spec -> visual).
Run: python3 generate_spec_doc.py   ->  ~/Desktop/explanation_representation_and_system.pdf
"""

import os
import math
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon, Group

# ── Fonts (Korean) ───────────────────────────────────────────────────────────
# Noto Sans KR (TrueType/glyf) — reportlab can't read AppleSDGothicNeo (CFF outlines).
import os as _os
_FDIRS = [_os.path.expanduser('~/Library/Fonts'), '/Library/Fonts', '/System/Library/Fonts/Supplemental']
def _find(*names):
    for d in _FDIRS:
        for n in names:
            p = _os.path.join(d, n)
            if _os.path.exists(p):
                return p
    return None
_REG  = _find('NotoSansKR-Regular.ttf', 'SpoqaHanSansNeo-Regular.ttf', 'AppleGothic.ttf')
_BOLD = _find('NotoSansKR-Bold.ttf', 'SpoqaHanSansNeo-Bold.ttf') or _REG
_LITE = _find('NotoSansKR-Light.ttf', 'SpoqaHanSansNeo-Light.ttf') or _REG
pdfmetrics.registerFont(TTFont('KR', _REG))
pdfmetrics.registerFont(TTFont('KR-Bold', _BOLD))
pdfmetrics.registerFont(TTFont('KR-Light', _LITE))

# ── Palette ──────────────────────────────────────────────────────────────────
C_INK    = colors.HexColor('#111827')
C_BODY   = colors.HexColor('#374151')
C_BLUE   = colors.HexColor('#2563eb')
C_INDIGO = colors.HexColor('#4f46e5')
C_GRAY   = colors.HexColor('#6b7280')
C_LIGHT  = colors.HexColor('#eef2ff')
C_BORDER = colors.HexColor('#cbd5e1')
C_CODE   = colors.HexColor('#0f172a')
C_CODEBG = colors.HexColor('#f8fafc')
C_GREEN  = colors.HexColor('#15803d')
C_AMBER  = colors.HexColor('#b45309')
C_RED    = colors.HexColor('#b91c1c')
C_SPEC   = colors.HexColor('#fef3c7')
C_GENBG  = colors.HexColor('#eff6ff')
C_VISBG  = colors.HexColor('#ecfdf5')

W, H = A4

def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

# ── Paragraph styles ─────────────────────────────────────────────────────────
S = {}
S['title']   = ParagraphStyle('title', fontName='KR-Bold', fontSize=21, leading=27, textColor=C_INK, spaceAfter=4)
S['sub']     = ParagraphStyle('sub', fontName='KR', fontSize=11.5, leading=17, textColor=C_GRAY, spaceAfter=16)
S['part']    = ParagraphStyle('part', fontName='KR-Bold', fontSize=15, leading=20, textColor=colors.white,
                              backColor=C_INDIGO, borderPad=6, spaceBefore=16, spaceAfter=8, leftIndent=0)
S['sec']     = ParagraphStyle('sec', fontName='KR-Bold', fontSize=12.5, leading=17, textColor=C_BLUE,
                              spaceBefore=12, spaceAfter=4)
S['subsec']  = ParagraphStyle('subsec', fontName='KR-Bold', fontSize=10.5, leading=15, textColor=C_INK,
                              spaceBefore=8, spaceAfter=3)
S['body']    = ParagraphStyle('body', fontName='KR', fontSize=9.5, leading=15, textColor=C_BODY, spaceAfter=5)
S['bullet']  = ParagraphStyle('bullet', fontName='KR', fontSize=9.5, leading=14, textColor=C_BODY,
                              spaceAfter=2, leftIndent=13, bulletIndent=3)
S['code']    = ParagraphStyle('code', fontName='KR-Light', fontSize=8, leading=11.6, textColor=C_CODE,
                              spaceBefore=2, spaceAfter=6, leftIndent=8, rightIndent=8, backColor=C_CODEBG,
                              borderColor=C_BORDER, borderWidth=0.5, borderPad=6)
S['note']    = ParagraphStyle('note', fontName='KR', fontSize=8.5, leading=12.5, textColor=C_GRAY, spaceAfter=4)
S['cap']     = ParagraphStyle('cap', fontName='KR', fontSize=8, leading=11, textColor=C_GRAY, spaceAfter=8, alignment=1)
S['cell']    = ParagraphStyle('cell', fontName='KR', fontSize=8, leading=10.8, textColor=C_BODY)
S['cellb']   = ParagraphStyle('cellb', fontName='KR-Bold', fontSize=8, leading=10.8, textColor=C_INK)
S['cellh']   = ParagraphStyle('cellh', fontName='KR-Bold', fontSize=8.3, leading=11, textColor=colors.white)
S['foot']    = ParagraphStyle('foot', fontName='KR', fontSize=7.5, leading=10, textColor=C_GRAY, alignment=1)

def P(t, st='body'):   return Paragraph(t, S[st])
def sec(t):            return Paragraph(t, S['sec'])
def subsec(t):         return Paragraph(t, S['subsec'])
def body(t):           return Paragraph(t, S['body'])
def code(t):           return Paragraph(esc(t).replace('\n', '<br/>'), S['code'])
def bullet(t):         return Paragraph('•&nbsp; ' + t, S['bullet'])
def note(t):           return Paragraph(t, S['note'])
def sp(n=6):           return Spacer(1, n)
def mono(t):           return '<font name="KR-Light">' + esc(t) + '</font>'   # inline file/symbol

def part(letter, t):
    return [Spacer(1, 4), Paragraph('PART ' + letter + '. ' + t, S['part'])]

def cap(t):            return Paragraph(t, S['cap'])

def hr(c=C_BORDER, th=0.6):
    return HRFlowable(width='100%', thickness=th, color=c, spaceBefore=3, spaceAfter=5)

# ── Table builder (wraps strings to Paragraphs, header row inverted) ──────────
def tbl(rows, widths, head_bg=C_INDIGO, font=8, align_left=True):
    data = []
    for ri, r in enumerate(rows):
        out = []
        for c in r:
            if isinstance(c, Paragraph):
                out.append(c)
            else:
                t = str(c)
                # cells built with mono()/inline markup are already escaped inside the tags
                markup = ('<font' in t) or ('<b>' in t) or ('<br' in t)
                txt = t if markup else esc(t)
                out.append(Paragraph(txt, S['cellh'] if ri == 0 else S['cell']))
        data.append(out)
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), head_bg),
        ('GRID', (0, 0), (-1, -1), 0.4, C_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f6f7fb')]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]
    t.setStyle(TableStyle(style))
    return t

# ═════════════════════════════════════════════════════════════════════════════
#  Vector diagrams (reportlab.graphics)
# ═════════════════════════════════════════════════════════════════════════════
def _box(g, x, y, w, h, title, lines=None, fill='#ffffff', stroke='#94a3b8',
         tcol='#0f172a', tsize=8.4, rx=5, title_bold=True):
    g.add(Rect(x, y, w, h, rx=rx, ry=rx, fillColor=colors.HexColor(fill),
               strokeColor=colors.HexColor(stroke), strokeWidth=0.9))
    cx = x + w / 2.0
    ty = y + h - 12 if lines else y + h / 2.0 - 3
    g.add(String(cx, ty, title, fontName='KR-Bold' if title_bold else 'KR',
                 fontSize=tsize, fillColor=colors.HexColor(tcol), textAnchor='middle'))
    if lines:
        for i, ln in enumerate(lines):
            g.add(String(cx, ty - 11 - i * 9.5, ln, fontName='KR-Light', fontSize=6.9,
                         fillColor=colors.HexColor('#475569'), textAnchor='middle'))

def _arrow(g, x1, y1, x2, y2, color='#475569', wdt=1.1, head=5.0):
    g.add(Line(x1, y1, x2, y2, strokeColor=colors.HexColor(color), strokeWidth=wdt))
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1
    ux, uy = dx / L, dy / L
    bx, by = x2 - head * 1.7 * ux, y2 - head * 1.7 * uy
    px, py = -uy, ux
    g.add(Polygon([x2, y2, bx + head * px, by + head * py, bx - head * px, by - head * py],
                  fillColor=colors.HexColor(color), strokeColor=colors.HexColor(color)))

def diagram_architecture():
    d = Drawing(478, 706)
    g = Group()
    # ── Inputs ────────────────────────────────────────────────────────────────
    g.add(String(239, 692, '입력  (Input)', fontName='KR-Bold', fontSize=8.5,
                 fillColor=C_GRAY, textAnchor='middle'))
    _box(g, 8,   648, 148, 38, 'Chart', ['Vega-Lite spec → ChartSpec'], fill='#f1f5f9')
    _box(g, 165, 648, 148, 38, 'Question', ['자연어 질문'], fill='#f1f5f9')
    _box(g, 322, 648, 148, 38, 'Explanation', ['자연어 단계별 설명'], fill='#f1f5f9')
    _arrow(g, 239, 646, 239, 624)

    # ── Generator container ────────────────────────────────────────────────────
    g.add(Rect(8, 470, 462, 150, rx=8, ry=8, fillColor=C_GENBG,
               strokeColor=C_BLUE, strokeWidth=1.2))
    g.add(String(20, 604, '① Specification Generator', fontName='KR-Bold',
                 fontSize=10, fillColor=C_BLUE, textAnchor='start'))
    g.add(String(20, 592, 'nlp_server/  (Python · FastAPI · LLM + 결정론적 후처리)',
                 fontName='KR-Light', fontSize=7, fillColor=C_GRAY, textAnchor='start'))
    _box(g, 18,  500, 104, 74, 'Inventory', ['LLM 호출 ①', 'explanation →', 'op task 목록',
                                             'module_inventory'], fill='#ffffff', stroke='#60a5fa', tsize=7.8)
    _box(g, 132, 500, 104, 74, 'Step-Compose', ['LLM 호출 ② (루프)', 'task→op_spec', '+ inputs 제안',
                                                'module_step_compose'], fill='#ffffff', stroke='#60a5fa', tsize=7.8)
    _box(g, 246, 500, 104, 74, 'Ground·Validate', ['grounding.py', 'op_registry.py', 'executor.py',
                                                   '(실행 검증)'], fill='#ffffff', stroke='#60a5fa', tsize=7.8)
    _box(g, 360, 500, 102, 74, 'Normalize·Schedule', ['normalize_meta', '_topo_phases', '(위상정렬)',
                                                      'scheduler.py'], fill='#ffffff', stroke='#60a5fa', tsize=7.8)
    _arrow(g, 122, 537, 132, 537, head=4)
    _arrow(g, 236, 537, 246, 537, head=4)
    _arrow(g, 350, 537, 360, 537, head=4)
    _arrow(g, 239, 468, 239, 446)

    # ── Specification artifact ─────────────────────────────────────────────────
    g.add(Rect(8, 392, 462, 52, rx=7, ry=7, fillColor=C_SPEC,
               strokeColor=C_AMBER, strokeWidth=1.3))
    g.add(String(239, 428, 'SPECIFICATION  —  OpsSpec (의존 그래프 DAG)',
                 fontName='KR-Bold', fontSize=10.5, fillColor=C_AMBER, textAnchor='middle'))
    g.add(String(239, 414, '{ ops:[…], ops2:[…], … }  ·  노드 = OperationSpec  ·  엣지 = meta.inputs + "ref:nN"',
                 fontName='KR-Light', fontSize=7.4, fillColor=colors.HexColor('#92400e'), textAnchor='middle'))
    g.add(String(239, 401, 'src/domain/operation/types/operationSpecs.ts  ·  opsSpec.ts',
                 fontName='KR-Light', fontSize=6.8, fillColor=colors.HexColor('#92400e'), textAnchor='middle'))
    _arrow(g, 239, 390, 239, 368)

    # ── Visualizer container ───────────────────────────────────────────────────
    g.add(Rect(8, 214, 462, 152, rx=8, ry=8, fillColor=C_VISBG,
               strokeColor=C_GREEN, strokeWidth=1.2))
    g.add(String(20, 350, '② Explanation Visualizer', fontName='KR-Bold',
                 fontSize=10, fillColor=C_GREEN, textAnchor='start'))
    g.add(String(20, 338, 'src/  (TypeScript · React · D3 — Vega 런타임 미사용)',
                 fontName='KR-Light', fontSize=7, fillColor=C_GRAY, textAnchor='start'))
    _box(g, 18,  244, 104, 78, 'Normalize', ['normalizeOpsGroups', 'ops/ops2 → 순서', '있는 그룹열'],
         fill='#ffffff', stroke='#34d399', tsize=7.8)
    _box(g, 132, 244, 104, 78, 'Dispatch + Build', ['renderChart →', 'ChartInstance', '초기 SVG 렌더'],
         fill='#ffffff', stroke='#34d399', tsize=7.8)
    _box(g, 246, 244, 104, 78, 'Per-op Applier', ['compute(dataOps)', '+ draw(primitive)', 'transitionScale'],
         fill='#ffffff', stroke='#34d399', tsize=7.8)
    _box(g, 360, 244, 102, 78, 'Compose', ['ChainState 전파', 'ref:nN 결과 유지', '(fan-out/split)'],
         fill='#ffffff', stroke='#34d399', tsize=7.8)
    _arrow(g, 122, 283, 132, 283, head=4)
    _arrow(g, 236, 283, 246, 283, head=4)
    _arrow(g, 350, 283, 360, 283, head=4)
    # internal loop hint on applier/compose
    g.add(String(408, 232, '(op 마다 반복)', fontName='KR-Light', fontSize=6.8,
                 fillColor=C_GREEN, textAnchor='middle'))
    _arrow(g, 239, 212, 239, 190)

    # ── Output ──────────────────────────────────────────────────────────────────
    _box(g, 90, 150, 298, 38, '출력: 단계별 시각적 설명 (Annotated SVG)',
         ['reference line · diff 화살표 · 강조/흐림 · 값 라벨이 누적된 차트'],
         fill='#f1f5f9', stroke='#475569', tsize=9)

    d.add(g)
    return d

def diagram_dag():
    d = Drawing(478, 312)
    g = Group()
    NW, NH = 78, 34
    def node(x, y, nid, op):
        _box(g, x, y, NW, NH, nid, [op], fill='#ffffff', stroke='#6366f1', tsize=8.6, rx=5)
    # sentence group rectangles (dashed)
    for gx, gw, lbl in [(20, 200, '문장 1  →  ops'), (256, 202, '문장 2  →  ops2')]:
        r = Rect(gx, 168, gw, 130, rx=7, ry=7, fillColor=colors.HexColor('#f5f3ff'),
                 strokeColor=colors.HexColor('#a5b4fc'), strokeWidth=0.8)
        r.strokeDashArray = [3, 2]
        g.add(r)
        g.add(String(gx + 8, 286, lbl, fontName='KR-Bold', fontSize=7.6,
                     fillColor=C_INDIGO, textAnchor='start'))
    # nodes
    node(34, 250, 'n1', 'retrieveValue 2016')
    node(130, 250, 'n2', 'retrieveValue 2017')
    node(82, 180, 'n3', 'diff (n1,n2)')
    node(270, 250, 'n4', 'retrieveValue 2017')
    node(366, 250, 'n5', 'retrieveValue 2018')
    node(318, 180, 'n6', 'diff (n4,n5)')
    # sentence 3 node
    r3 = Rect(176, 76, 126, 96, rx=7, ry=7, fillColor=colors.HexColor('#fff7ed'),
              strokeColor=colors.HexColor('#fdba74'), strokeWidth=0.8)
    r3.strokeDashArray = [3, 2]
    g.add(r3)
    g.add(String(184, 160, '문장 3 → ops3', fontName='KR-Bold', fontSize=7.6,
                 fillColor=C_AMBER, textAnchor='start'))
    _box(g, 200, 96, NW, NH, 'n7', ['diff (n3,n6)'], fill='#fffbeb', stroke='#f59e0b', tsize=8.6)
    # edges
    _arrow(g, 73, 250, 110, 214, color='#6366f1')
    _arrow(g, 169, 250, 130, 214, color='#6366f1')
    _arrow(g, 309, 250, 346, 214, color='#6366f1')
    _arrow(g, 405, 250, 366, 214, color='#6366f1')
    _arrow(g, 121, 180, 222, 130, color='#f59e0b')
    _arrow(g, 357, 180, 256, 130, color='#f59e0b')
    g.add(String(239, 60, 'n3 와 n6 의 결과가 n7 으로 수렴 (in-degree 2).  "ref:nN" 이 id 참조이므로 이런 합류가 표현된다.',
                 fontName='KR-Light', fontSize=7, fillColor=C_GRAY, textAnchor='middle'))
    d.add(g)
    return d

def diagram_dag_shapes():
    d = Drawing(478, 150)
    g = Group()
    def dot(x, y, t, c='#475569'):
        g.add(Rect(x - 13, y - 11, 26, 22, rx=4, ry=4, fillColor=colors.white,
                   strokeColor=colors.HexColor(c), strokeWidth=1.1))
        g.add(String(x, y - 3.5, t, fontName='KR-Bold', fontSize=8.5,
                     fillColor=colors.HexColor(c), textAnchor='middle'))
    # divider
    g.add(Line(239, 8, 239, 132, strokeColor=C_BORDER, strokeWidth=0.6))
    # Convergence (left)
    g.add(String(120, 126, '수렴  in-degree ≥ 2', fontName='KR-Bold', fontSize=8.5,
                 fillColor=C_BLUE, textAnchor='middle'))
    g.add(String(120, 114, '→ 리스트로 표현 불가', fontName='KR-Light', fontSize=7.2,
                 fillColor=C_GRAY, textAnchor='middle'))
    dot(70, 86, 'A', '#2563eb'); dot(170, 86, 'B', '#2563eb'); dot(120, 36, 'C', '#1e3a8a')
    _arrow(g, 70, 75, 112, 47, color='#2563eb', wdt=1.0)
    _arrow(g, 170, 75, 128, 47, color='#2563eb', wdt=1.0)
    g.add(String(120, 16, 'diff · add · compareBool · pairDiff', fontName='KR-Light',
                 fontSize=6.8, fillColor=C_GRAY, textAnchor='middle'))
    # Fan-out (right)
    g.add(String(358, 126, '팬아웃  out-degree ≥ 2', fontName='KR-Bold', fontSize=8.5,
                 fillColor=C_GREEN, textAnchor='middle'))
    g.add(String(358, 114, '→ 트리로 표현 불가', fontName='KR-Light', fontSize=7.2,
                 fillColor=C_GRAY, textAnchor='middle'))
    dot(358, 86, 'A', '#15803d'); dot(308, 36, 'B', '#166534'); dot(408, 36, 'C', '#166534')
    _arrow(g, 350, 75, 314, 49, color='#15803d', wdt=1.0)
    _arrow(g, 366, 75, 402, 49, color='#15803d', wdt=1.0)
    g.add(String(358, 16, '한 결과 id 를 여러 후속 노드가 참조', fontName='KR-Light',
                 fontSize=6.8, fillColor=C_GRAY, textAnchor='middle'))
    d.add(g)
    return d

# ═════════════════════════════════════════════════════════════════════════════
#  Content
# ═════════════════════════════════════════════════════════════════════════════
def content():
    s = []

    # ── Cover ──
    s += [
        sp(8),
        P('Explanation Representation &amp; System', 'title'),
        P('차트 질문에 대한 단계별 시각적 설명 — 명세(Specification) 데이터 모델과 두 컴포넌트(Generator · Visualizer)의 코드 기반 분석', 'sub'),
        hr(C_INDIGO, 1.2),
        body('본 문서는 논문의 <b>Explanation Representation</b> 섹션(PART A)과 <b>System</b> 섹션'
             '(PART B·C·D)을 위한 참조 자료다. 모든 항목은 추측이 아니라 저장소의 실제 파일·함수·필드를 '
             '인용한다. 핵심 관찰: 이 시스템의 explanation 명세는 <b>operation을 노드로, operation 간 데이터 '
             '의존을 엣지로 갖는 의존 그래프(DAG)</b>이며, 엣지는 배열의 순서가 아니라 노드 id 참조'
             '(' + mono('meta.inputs') + ' + ' + mono('"ref:nN"') + ')로 표현된다.'),
        sp(2),
        tbl([
            ['컴포넌트', '역할', '구현 위치 (언어)'],
            ['Specification Generator', '자연어 explanation → OpsSpec(DAG)', mono('nlp_server/')+'  (Python · FastAPI · LLM)'],
            ['Explanation Visualizer', 'OpsSpec → SVG 위 단계별 시각 설명', mono('src/')+'  (TypeScript · React · D3)'],
            ['Specification (중간 산출물)', '두 컴포넌트를 잇는 데이터 모델', mono('src/domain/operation/')+'  (TS 타입)'],
        ], [3.7*cm, 6.3*cm, 6.7*cm]),
        sp(8),
        note('표기: ' + mono('파일/심볼') + ' 은 코드 경로·함수명. 인용한 줄 번호는 분석 시점 기준이며 이름으로도 찾을 수 있다. '
             '실행 가능한 atomic operation 은 18종(' + mono('op_registry.py') + '), 여기에 제어용 메타 op'
             '(' + mono('draw') + ', ' + mono('sleep') + ')를 더하면 TS 상수는 20종이다.'),
        PageBreak(),
    ]

    # ══════════════════════════════════════════════════════════════════════════
    #  PART A
    # ══════════════════════════════════════════════════════════════════════════
    s += part('A', 'Specification 구조  (Explanation Representation)')
    s += [body('이 절은 explanation 명세 자체를 <b>독립된 데이터 모델</b>로 정의한다. 코드상 정식 명칭은 '
               '“OpsSpec”(operation specification)이며, 데이터셋 컬럼명으로는 ' + mono('operation_spec') + ' 이다.')]

    # A-1
    s += [sec('A-1. 전체 스키마')]
    s += [subsec('A-1-1. 단순 예시 (선형 체인)')]
    s += [body('차트 ' + mono('2jromeq5u9lloh1s') + ' (단일 시리즈 line). 질문 “Which years has the biggest jump?”, '
               'explanation “1. Get the difference between every year  2. Get the extremum”. 두 문장 → 두 그룹:')]
    s += [code(
'{\n'
'  "ops":  [ {"op":"lagDiff",      "id":"n1",\n'
'             "meta":{"nodeId":"n1","inputs":[],     "sentenceIndex":1}, "field":"Audience_Millions"} ],\n'
'  "ops2": [ {"op":"findExtremum", "id":"n2",\n'
'             "meta":{"nodeId":"n2","inputs":["n1"], "sentenceIndex":2}, "which":"max"} ]\n'
'}')]
    s += [note('엣지는 단 하나: ' + mono('n2.meta.inputs = ["n1"]') + ' — “n1(인접 연도차)의 출력이 n2(최댓값)의 입력”. '
               'lagDiff 의 결과 마크집합이 그대로 findExtremum 의 작업 데이터가 된다.')]

    s += [subsec('A-1-2. 복잡한 예시 (분기 + 수렴)')]
    s += [body('차트 ' + mono('0pzdf7hfbxgjghsa') + ' (simple bar). 질문 “How big was the change from 2016 to 2017 '
               'compared to the change from 2017 to 2018?”. 세 문장 → 세 그룹. 두 개의 독립적 하위 그래프'
               '(n1,n2→n3) 와 (n4,n5→n6) 가 마지막 n7 에서 합류한다:')]
    s += [code(
'{\n'
'  "ops":  [ {"op":"retrieveValue","id":"n1","meta":{"nodeId":"n1","inputs":[],        "sentenceIndex":1},"target":"2016"},\n'
'            {"op":"retrieveValue","id":"n2","meta":{"nodeId":"n2","inputs":[],        "sentenceIndex":1},"target":"2017"},\n'
'            {"op":"diff",         "id":"n3","meta":{"nodeId":"n3","inputs":["n1","n2"],"sentenceIndex":1},\n'
'             "targetA":"ref:n1","targetB":"ref:n2","signed":false} ],\n'
'  "ops2": [ {"op":"retrieveValue","id":"n4","meta":{"nodeId":"n4","inputs":[],        "sentenceIndex":2},"target":"2017"},\n'
'            {"op":"retrieveValue","id":"n5","meta":{"nodeId":"n5","inputs":[],        "sentenceIndex":2},"target":"2018"},\n'
'            {"op":"diff",         "id":"n6","meta":{"nodeId":"n6","inputs":["n4","n5"],"sentenceIndex":2},\n'
'             "targetA":"ref:n4","targetB":"ref:n5","signed":false} ],\n'
'  "ops3": [ {"op":"diff",         "id":"n7","meta":{"nodeId":"n7","inputs":["n3","n6"],"sentenceIndex":3},\n'
'             "targetA":"ref:n3","targetB":"ref:n6","signed":false} ]\n'
'}')]
    s += [note('스칼라 결과 참조는 op 필드 안의 문자열 ' + mono('"ref:nN"') + ' 으로(여기 ' + mono('targetA/targetB') +
               '), 그리고 같은 의존이 ' + mono('meta.inputs') + ' 에 노드 id 로 중복 기재된다(둘은 정규화 단계에서 동기화).')]
    s += [diagram_dag(), cap('그림 A-1. 복잡한 예시의 의존 그래프. 점선 = 문장 단위 그룹(ops/ops2/ops3), 화살표 = meta.inputs 엣지. n7 은 in-degree 2.')]

    s += [subsec('A-1-3. 스키마 정의 코드')]
    s += [tbl([
        ['요소', '정의 위치'],
        ['op 종류 상수 (열거)', mono('src/domain/operation/types/operationNames.ts')+' — '+mono('OperationOp')],
        ['노드 공통 필드 (옵션 합집합)', mono('src/domain/operation/types/index.ts')+' — '+mono('interface OperationSpec')],
        ['op별 노드 인터페이스', mono('src/domain/operation/types/operationSpecs.ts')+' — '+mono('OpAverageSpec')+' 등'],
        ['최상위 래퍼 + 정규화', mono('src/domain/operation/opsSpec.ts')+' — '+mono('OpsSpecGroupMap')+', '+mono('normalizeOpsGroups()')],
        ['단일 datum 표현', mono('src/domain/operation/types/index.ts')+' — '+mono('interface DatumValue')],
        ['실행 계약 (Python, 18-op)', mono('nlp_server/opsspec/runtime/op_registry.py')+' — '+mono('OpContract')+', '+mono('_OP_SEQUENCE')],
    ], [5.4*cm, 11.3*cm]),
        sp(4)]

    # A-1-2 top-level
    s += [subsec('최상위 구조 — operation 목록이 아니라 “그룹 맵”')]
    s += [body('최상위는 단순 배열이 아니라 객체(그룹 맵)다. ' + mono('OpsSpecGroupMap') + ' = '
               '{ ' + mono('ops?: OperationSpec[]') + ', 그리고 추가 그룹키 ' + mono('ops2, ops3, … (또는 임의 이름, last)') +
               ' }. 각 그룹은 자연어 explanation의 <b>한 문장(step)</b>에 대응하는 노드들의 정렬 배열이다. '
               + mono('normalizeOpsGroups()') + ' (' + mono('opsSpec.ts:72') + ') 가 이 맵을 받아 그룹 순서를 '
               '결정한다: ' + mono('ops') + ' → ' + mono('ops1,ops2,…(숫자 오름차순)') + ' → 기타 이름(알파벳) → ' +
               mono('last') + '. 배열/단일 op 입력도 모두 ' + mono('{name, ops}[]') + ' 로 정규화한다.')]
    s += [body('정리하면 명세는 <b>2단 구조</b>다: (1) 그룹 = 문장 단위 묶음(시각화에서 substep 경계), '
               '(2) 그룹 내부의 노드들이 ' + mono('meta.inputs') + ' 로 DAG를 이루고, 그룹 사이에는 ' + mono('"ref:nN"') +
               ' 교차 참조만으로 연결된다.')]

    # A-2 node
    s += [sec('A-2. 노드(operation) 구조')]
    s += [body('A-2-1. 한 노드는 ' + mono('OperationSpec') + ' (' + mono('types/index.ts:67') + ') 이다. 공통 필드는 모두 '
               '옵션이며 op마다 부분집합을 쓴다. op별 필수 필드는 ' + mono('operationSpecs.ts') + ' 의 확장 인터페이스가 좁힌다.')]
    s += [tbl([
        ['필드', '타입', '의미'],
        ['op', 'string (OperationOp)', '연산 종류. 노드 식별의 핵심 (예 average, diff, filter)'],
        ['id', 'string', '노드 고유 id. 항상 '+mono('"n"+정수')+' (n1, n2, …)'],
        ['meta', '{ nodeId, inputs[], sentenceIndex, source, view? }', '그래프 메타데이터 — A-3 참조'],
        ['field', 'string', '대상 측정/범주 필드 (예 "Sales"). 생략 시 primary measure'],
        ['target / targetA / targetB', 'TargetSelector | TargetSelector[]', '피연산 대상(라벨/숫자) 또는 '+mono('"ref:nN"')+' 스칼라 참조'],
        ['which / order / operator', "'max'|'min' / 'asc'|'desc' / 비교연산자", 'op별 파라미터'],
        ['value / include / exclude', 'JsonValue / 배열', 'filter 임계값·멤버십 (value 는 '+mono('"ref:nN"')+' 가능)'],
        ['group / groupA / groupB / by / seriesField', 'string | null', '시리즈/그룹 선택 (grouped·stacked·multi-line)'],
        ['n / from / which / window / direction …', '스칼라', 'nth·rollingWindow·monotonicRun 등 op별 옵션'],
    ], [4.0*cm, 5.2*cm, 7.5*cm]),
        sp(3)]
    s += [body('A-2-2. <b>식별자</b>: id 는 LLM 이 아니라 Generator 가 결정론적으로 부여한다 — '
               '실행 순서대로 ' + mono('node_id = f"n{len(executed)+1}"') + ' (' + mono('pipeline.py') +
               '). 이후 ' + mono('id') + ' 와 ' + mono('meta.nodeId') + ' 는 항상 같다.')]
    s += [body('A-2-3. <b>입력/출력 기술</b>: 노드는 자신의 출력을 명시적 필드로 적지 않는다. 출력은 op 실행 결과'
               '(항상 ' + mono('DatumValue[]') + ')로 런타임이 만들고, 노드 id 로 결과 저장소에 보관된다. '
               '입력은 ' + mono('meta.inputs') + '(상위 노드 id 목록) + 필드 내 ' + mono('"ref:nN"') + '(스칼라 참조)로만 기술된다. '
               '즉 노드는 “무엇을 읽는가”만 선언하고 “무엇을 쓰는가”는 id 로 암묵 결정된다.')]

    # A-3 edges — most important
    s += [sec('A-3. 엣지(의존 관계) 구조  ★ 핵심')]
    s += [body('A-3-1. “A의 출력이 B의 입력” 은 <b>두 가지 동기화된 방식</b>으로 표현된다.')]
    s += [bullet('<b>데이터 의존 (마크집합)</b>: ' + mono('B.meta.inputs') + ' 배열에 상위 노드 id(예 ' + mono('"n1"') +
                 ')를 넣는다. 런타임은 그 id 의 결과를 B의 작업 데이터(' + mono('workingData') + ')로 주입한다.')]
    s += [bullet('<b>스칼라 의존 (계산값)</b>: B의 op 필드(' + mono('targetA/targetB/value/targetValue/target') +
                 ')에 문자열 ' + mono('"ref:nN"') + ' 을 둔다. 정규화 시 이 ref 도 ' + mono('meta.inputs') + ' 에 합쳐진다'
                 ' (' + mono('normalize_meta_inputs()') + ', ' + mono('nlp_server/opsspec/runtime/normalize.py') + ').')]
    s += [body('A-3-2. <b>그래프를 실제로 구성하는 코드.</b> 노드 목록과 의존 정보로부터 그래프를 만드는 곳은 두 군데다.')]
    s += [tbl([
        ['단계', '함수 / 파일', '동작'],
        ['엣지 수집·위상정렬\n(Generator)', mono('scheduler.py')+'\n'+mono('_collect_edges()')+' → '+mono('_topo_phases()'),
         mono('meta.inputs')+' 로 인접 구조 '+mono('{node: parents}')+' 를 만들고 Kahn 식 위상정렬로 phase·병렬그룹 산출'],
        ['엣지 정규화\n(Generator)', mono('normalize.py')+'\n'+mono('normalize_meta_inputs()'),
         '명시적 inputs + 필드 내 '+mono('"ref:nN"')+' 를 합쳐 dedupe·정렬, nodeId 숫자순으로 노드 정렬'],
        ['엣지 수집·결과 유지\n(Visualizer)', mono('diffEndpoint.ts')+'\n'+mono('collectReferencedResultIds()'),
         '모든 op의 ref 를 Set 으로 모아, 어떤 노드의 결과를 화면에 살려둘지 결정'],
        ['엣지 따라 데이터 주입\n(Visualizer)', mono('executionState.ts')+'\n'+mono('stateWithOperationDependencies()'),
         '실행 시 inputs 중 데이터 의존을 골라 결과 저장소에서 꺼내 '+mono('workingData')+' 로 주입'],
    ], [3.0*cm, 5.0*cm, 8.7*cm]),
        sp(3)]
    s += [code(
'# nlp_server/opsspec/runtime/scheduler.py  —  의존 정보로 그래프를 만든다\n'
'def _collect_edges(groups):\n'
'    edges = {}\n'
'    for ops in groups.values():\n'
'        for op in ops:\n'
'            node = op.meta.nodeId\n'
'            edges[node] = set(op.meta.inputs or [])   # node ← parents\n'
'    return edges\n'
'# _topo_phases(edges): roots(부모 0) 부터 제거하며 phase 부여 → 위상정렬')]

    s += [subsec('A-3-3. 팬아웃 (out-degree ≥ 2) — 표현 가능')]
    s += [body('가능하다. 엣지가 <b>순서·배열이 아니라 노드 id 참조</b>이기 때문이다. 같은 id ' + mono('"ref:n1"') +
               ' 가 서로 다른 두 후속 노드의 필드/inputs 에 동시에 등장할 수 있고, 이를 막는 제약이 없다. 실행 측에서는 '
               '결과가 노드 id 를 키로 한 dict 에 저장되어(' + mono('storeRuntimeResult/getRuntimeResultsById') + ', '
               + mono('dataOps.ts') + '; Python 측 ' + mono('executor.py') + ' 의 ' + mono('self.runtime[nodeId]') +
               ') 임의 횟수로 재참조된다. 시각적으로는 참조된 결과 주석이 ' + mono('RESULT_REF_ATTRIBUTE') +
               ' (=' + mono('data-operation-result-ref') + ') 로 태깅되어, 모든 소비 노드가 쓸 때까지 삭제되지 않는다.')]
    s += [note('실제 gold 코퍼스에서는 저자들이 종종 팬아웃 대신 노드를 복제한다(예 A-1-2 에서 2017 값을 n2·n4 로 두 번 retrieve). '
               '스키마는 팬아웃을 허용하지만 수렴이 압도적으로 흔하다.')]

    s += [subsec('A-3-4. 수렴 (in-degree ≥ 2) — 어디에나 있음')]
    s += [body('한 노드가 두 개 이상 상위 결과를 받는 경우다. ' + mono('diff/add/compareBool') + ' 는 ' + mono('targetA') +
               ' 와 ' + mono('targetB') + ' 두 입력을, ' + mono('pairDiff') + ' 는 ' + mono('groupA/groupB') + ' 두 시리즈를 받는다. '
               '따라서 ' + mono('meta.inputs') + ' 길이가 2 이상이 된다(A-1-2 의 n3, n6, n7). 코퍼스에서 가장 흔한 분기 형태다.')]

    s += [subsec('A-3-5. 왜 리스트도 트리도 아닌 일반 DAG 인가')]
    s += [diagram_dag_shapes(), cap('그림 A-2. 두 구조적 사실. 수렴은 “리스트 아님”을, 팬아웃은 “트리 아님”을 강제한다.')]
    s += [bullet('<b>리스트로 불가</b>: 리스트 노드는 in-degree ≤ 1. 그러나 ' + mono('diff(ref:n1, ref:n2)') +
                 ' 는 in-degree 2 이므로 선형 리스트로 표현할 수 없다 (수렴, A-3-4).')]
    s += [bullet('<b>트리로 불가</b>: 결과를 뿌리로 본 트리는 각 노드의 out-degree ≤ 1. 그러나 하나의 중간 결과를 두 후속 '
                 '노드가 공유하면 out-degree 2 가 되어 트리가 깨진다 (팬아웃, A-3-3). 엣지가 id 참조라 이 공유가 자연스럽게 표현된다.')]
    s += [bullet('두 성질이 공존 가능하므로 명세는 <b>일반 DAG</b> 여야 한다. 코드도 이를 전제한다: ' + mono('_topo_phases()') +
                 ' 는 트리가 아닌 일반 DAG 위상정렬이고, ' + mono('collectReferencedResultIds()') + ' 는 공유 결과를 Set 으로 다룬다.')]

    # A-4 atomic ops
    s += [PageBreak(), sec('A-4. Atomic operation 목록')]
    s += [body('A-4-1. 실행 가능한 atomic operation 전체 목록은 ' + mono('nlp_server/opsspec/runtime/op_registry.py') +
               ' 의 ' + mono('_OP_SEQUENCE') + ' (18종)에 정의된다. TS 측 열거는 ' + mono('operationNames.ts') +
               ' 로, 여기에 제어용 메타 op ' + mono('draw') + '·' + mono('sleep') + ' 를 더해 20개 상수다(실행 계약에서는 제외).')]
    s += [body('A-4-3. <b>분류 기준</b>은 우리가 부여한 것이 아니라 <b>코드에 존재</b>한다: ' +
               mono('src/domain/operation/operationCategory.ts') + ' 의 ' + mono('OPERATION_CATEGORY') +
               ' 가 각 op 을 family 로 매핑한다. 아래 표는 그 family 별로 묶었다 (passthrough / aggregate / binary / '
               'series-transform / arithmetic; ' + mono('meta') + ' = draw·sleep 은 제외).')]
    s += [body('A-4-2. 각 op 의 입력 종류·개수, 출력 종류, 파라미터 (계산 본체는 ' +
               mono('src/domain/operation/dataOps.ts') + ' 의 순수 함수):')]

    OPW = [2.05*cm, 4.35*cm, 3.85*cm, 2.15*cm, 4.25*cm]
    def op_header():
        return [P('연산', 'cellh'), P('한 줄 설명', 'cellh'), P('입력 (종류·개수)', 'cellh'),
                P('출력', 'cellh'), P('주요 파라미터', 'cellh')]
    def fam(title, desc):
        return tbl([[Paragraph('<font color="white"><b>'+esc(title)+'</b>  '+esc(desc)+'</font>', S['cell'])]],
                   [16.65*cm], head_bg=C_BLUE)
    def optable(rows):
        return tbl([op_header()] + rows, OPW)

    s += [sp(2), fam('① passthrough  (선택·정렬)', '마크 의미를 보존한 채 부분집합 선택/재정렬 → 출력도 마크집합')]
    s += [optable([
        ['retrieveValue', '특정 x 라벨(또는 y 값)의 데이터 점 선택', '현재 마크집합 + target 1개', '마크집합(부분집합)', 'target, targetAxis(x|y), field, group'],
        ['filter', '멤버십·비교·시리즈 한정으로 범위 축소', '현재 마크집합 (+선택적 ref:n 임계값)', '마크집합', 'field, operator, value/include/exclude, group'],
        ['findExtremum', '최대/최소(또는 k번째) 값의 점 선택', '현재 마크집합', '스칼라 datum (1행)', 'which(max|min), field, rank, group'],
        ['sort', '한 필드 기준 오름/내림차순 정렬', '현재 마크집합', '마크집합(정렬됨)', 'field, order, orderField, group'],
        ['nth', '위치 n번째(앞/뒤) 점 선택', '현재 마크집합', '스칼라 또는 마크집합', 'n(number|number[]), from, orderField, order'],
    ])]
    s += [sp(4), fam('② aggregate  (집계)', '마크집합을 스칼라(또는 윈도우 스칼라열)로 축약')]
    s += [optable([
        ['sum', '측정값 합계', '현재 마크집합', '스칼라 datum', 'field(필수), group'],
        ['average', '측정값 산술평균', '현재 마크집합', '스칼라 datum', 'field, group'],
        ['count', '행 개수', '현재 마크집합', '스칼라 datum', 'group'],
        ['range', '최대−최소 폭 (+극점 메타)', '현재 마크집합', '스칼라 datum', 'field, group'],
        ['rollingWindow', '크기 w 슬라이딩 윈도우 집계', '현재 마크집합', '마크집합 (N−w+1행)', 'window(필수), aggregate, field, orderField'],
    ])]
    s += [sp(4), fam('③ binary  (비교·도출)', '두 피연산자에서 하나의 값/판정을 도출')]
    s += [optable([
        ['diff', 'targetA−targetB (차·비·증감률)', '입력 2개 (라벨 또는 ref:n)', '스칼라 datum', 'signed, mode(difference|ratio), percent, aggregate, precision'],
        ['diffByValue', '각 행과 기준 스칼라의 편차', '현재 마크집합 + 스칼라 1개 (value 또는 ref:n)', '마크집합 (행별 편차)', 'value/targetValue, signed, field, group'],
        ['compareBool', '두 값 비교 결과(참/거짓)', '입력 2개 (라벨 또는 ref:n)', '불리언 (스칼라 datum)', 'operator, aggregate, groupA/B, field'],
    ])]
    s += [sp(4), fam('④ series-transform  (시계열 파생)', '순서열에서 새 행들을 파생')]
    s += [optable([
        ['lagDiff', '인접 행 간 차이(전년 대비 등)', '현재 마크집합 (정렬)', '마크집합 (N−1행)', 'orderField, order, absolute, field, group'],
        ['pairDiff', '두 시리즈의 키별 차이 (A−B)', '두 시리즈 (groupA, groupB)', '마크집합 (키별 1행)', 'by, groupA/B(필수), seriesField, field, aggregate, signed, absolute'],
        ['monotonicRun', '최장/첫 단조 증가·감소 구간 추출', '현재 마크집합 (정렬)', '마크집합 (또는 단일)', 'direction, strict, mode, minLength, orderField, field'],
    ])]
    s += [sp(4), fam('⑤ arithmetic  (산술)', '앞선 스칼라 결과들 간의 순수 산술 — 데이터 비의존')]
    s += [optable([
        ['add', '두 스칼라 합', '스칼라 2개 (보통 ref:n)', '스칼라 datum', '(aggregate, field)'],
        ['scale', '스칼라 × factor', '스칼라 1개(target) + factor', '스칼라 datum', 'factor(필수), field'],
    ])]
    s += [sp(4), note('“스칼라 datum” = 길이 1의 ' + mono('DatumValue[]') + ' (값이 ' + mono('.value') + ' 에 담김). '
                      '“마크집합” = 차트의 실제 점/막대에 대응하는 ' + mono('DatumValue[]') + '. 두 출력 모두 같은 타입이라 op 들이 자유롭게 연결된다(A-5).')]

    # A-5 state
    s += [sec('A-5. 상태(state) 표현')]
    s += [body('A-5-1/2. op 가 실행되며 바뀌는 상태는 ' + mono('ChainState') + ' (' + mono('src/operation-next/chainState.ts:90') +
               ') 객체로, op→op 으로 명시적으로 전달된다. 핵심 필드:')]
    s += [tbl([
        ['ChainState 필드 (내부)', '타입', '의미'],
        ['originalData', 'readonly DatumValue[]', '원본 전체 데이터 (불변)'],
        ['workingData', 'DatumValue[]', '현재 작업 대상. filter 후 부분집합이 다음 op 입력'],
        ['lastResult', 'DatumValue[] | null', '직전 op 의 반환값'],
        ['derivedData', 'DatumValue[] | null', 'lagDiff/pairDiff 가 만든 파생 행 (그룹 경계에서 리셋)'],
        ['salienceMap', 'Map(string→number)', '마크 target → 현재 opacity (강조 0.x ~ 1.0)'],
        ['scaleState', 'ScaleRecord | null', '축이 rescale 된 도메인 정보 (이후 주석 위치 보정)'],
        ['filterContext', 'FilterContext | null', '현재 좁혀진 범위·사유 (그룹 경계 넘어 유지)'],
        ['annotationRecords', 'AnnotationRecord[]', '화면에 떠 있는 주석 목록 (재사용/제거 판단)'],
    ], [4.6*cm, 4.2*cm, 7.85*cm]),
        sp(3)]
    s += [body('스칼라 vs 마크집합 — 둘 다 ' + mono('DatumValue') + ' 로 통일된다. 평균·합·차이 같은 스칼라는 '
               + mono('makeScalarDatum()') + ' (' + mono('dataOps.ts') + ') 가 길이 1 배열로 감싸고 ' + mono('.value') +
               ' 에 숫자를, ' + mono('semanticMeasure') + ' 에 “avg(Sales)” 같은 의미 라벨을 둔다. 그래서 “선택된 마크들”과 '
               '“계산된 중간값”이 같은 자료형으로 흐른다. 노드 id 별 결과 저장소(' + mono('storeRuntimeResult') + ', 직렬화는 '
               + mono('serializeChainState/restoreChainState') + ', ' + mono('executionState.ts') + ')가 ' + mono('"ref:nN"') + ' 해소를 담당.')]
    s += [body('그룹 경계 ' + mono('clearGroupBoundary()') + ' (' + mono('chainState.ts:172') + '): ' +
               mono('derivedData·lastResult·salienceMap·annotationRecords·scaleState') + ' 는 리셋, ' +
               mono('workingData·filterContext') + ' 는 유지(문장 간 필터 효과 지속).')]
    s += [subsec('A-5-3. 내부 표현 ↔ 사용자가 보는 개념')]
    s += [tbl([
        ['내부 표현', '사용자가 화면에서 보는 것'],
        ['workingData (현재 부분집합)', '“지금 선택·강조된 막대/점들”'],
        ['salienceMap 의 opacity', '“선명한 마크 vs 흐려진(범위 밖) 마크”'],
        ['scaleState 의 도메인 변경', '“필터 후 다시 맞춰진 축 눈금”'],
        ['스칼라 datum (.value)', '“방금 계산된 값” — 평균선·차이 화살표 옆 숫자 라벨'],
        ['annotationRecords', '“차트 위에 떠 있는 주석들”(평균선·화살표·라벨)'],
        ['filterContext', '“현재 좁혀진 구간”(예 2010년 이후)'],
    ], [6.8*cm, 9.85*cm]),
        sp(2)]

    # ══════════════════════════════════════════════════════════════════════════
    #  PART B
    # ══════════════════════════════════════════════════════════════════════════
    s += [PageBreak()]
    s += part('B', 'Specification Generator  (자연어 → spec)')
    s += [sec('B-1. 단계 구성')]
    s += [body('B-1-2. <b>하이브리드</b>다 — LLM 호출 2종 + 결정론적(규칙) 후처리. 진입점은 ' +
               mono('nlp_server/main.py') + ' 의 ' + mono('POST /generate_grammar') + ' → ' + mono('OpsSpecPipeline.generate()') +
               ' (' + mono('nlp_server/opsspec/pipeline.py') + '). 입력 = { question, explanation, vega_lite_spec, data_rows }, '
               '출력 = OpsSpec 그룹 맵 + text chunks.')]
    s += [body('B-1-2 (LLM 백엔드): ChatGPT 5.2')]
    s += [body('B-1-1. 단계 순서:')]
    s += [tbl([
        ['#', '단계', '파일 / 함수', 'LLM?'],
        ['1', '차트 컨텍스트 구성 (필드·시리즈·도메인·통계 추출)', mono('runtime/context_builder.py')+' — '+mono('build_chart_context()'), '규칙'],
        ['2', 'Inventory: explanation → op task 목록', mono('modules/module_inventory.py')+' — '+mono('run_inventory_module()'), 'LLM ①'],
        ['3', 'Step-Compose 루프: task 하나씩 → op_spec + inputs', mono('modules/module_step_compose.py')+' — '+mono('run_step_compose_module()'), 'LLM ②(반복)'],
        ['4', 'Grounding: 토큰 정규화·값 fuzzy 매칭', mono('runtime/grounding.py')+' — '+mono('ground_op_spec()'), '규칙'],
        ['5', 'id·meta 부착 + 계약 검증 + 실제 실행', mono('pipeline.py')+', '+mono('validators.py')+', '+mono('executor.py'), '규칙'],
        ['6', '정규화·스케줄: meta.inputs 동기화, 위상정렬', mono('runtime/normalize.py')+', '+mono('runtime/scheduler.py'), '규칙'],
    ], [0.7*cm, 5.3*cm, 8.65*cm, 2.0*cm]),
        sp(3)]
    s += [body('B-1-3. <b>노드 분해 vs 엣지 결정.</b> 문장 → op task 분해는 LLM(Inventory, 단계 2)이 한다. '
               '엣지(의존)는 <b>두 출처가 합쳐진다</b>: ① Step-Compose 가 제안하는 ' + mono('inputs') + ' 목록(LLM), '
               '② op 파라미터 안의 ' + mono('"ref:nN"') + ' 에서 자동 추출(규칙, ' + mono('extract_scalar_ref_deps()') +
               ', ' + mono('runtime/artifacts.py') + '의 정규식 ' + mono('^ref:(n[0-9]+)$') + '). 단계 6 ' +
               mono('normalize_meta_inputs()') + ' 가 둘을 합쳐 ' + mono('meta.inputs') + ' 를 확정한다.')]
    s += [body('핵심: <b>id·meta 는 LLM 이 만들지 않는다.</b> LLM 은 op 종류·파라미터·inputs(논리적 의존)만 내고, '
               '노드 id(n1,n2,…)와 ' + mono('meta') + ' 부착은 pipeline 이 실행 순서대로 결정론적으로 수행한다. '
               '이로써 같은 explanation 에 대해 그래프 구조가 안정적으로 재현된다.')]
    s += [code(
'# pipeline.py — 결정론적 id/meta 부착 (LLM 출력에 덧씌움)\n'
'node_id = f"n{len(executed_node_ids) + 1}"\n'
'op_dict["id"]   = node_id\n'
'op_dict["meta"] = {"nodeId": node_id,\n'
'                    "inputs": sorted(set(parsed.inputs) | scalar_ref_deps),\n'
'                    "sentenceIndex": picked_task.sentenceIndex}')]
    s += [subsec('B-1-4. 검증 / 후처리')]
    s += [bullet('<b>스키마 검증</b>: Inventory·Step-Compose 출력은 Pydantic 모델로 검증, 실패 시 피드백과 함께 재시도'
                 ' (' + mono('validation/recursive_validators.py') + ', 최대 ' + mono('RECURSIVE_MAX_RETRIES') + ').')]
    s += [bullet('<b>계약 검증</b>: op별 필수 필드·의미 규칙을 ' + mono('op_registry.py') + ' 의 ' + mono('OpContract') +
                 '(required_fields, semantic_rules)로 점검 (' + mono('validators.py') + ' — ' + mono('validate_operation()') + ').')]
    s += [bullet('<b>실행 검증(grounding loop)</b>: 각 노드를 즉시 ' + mono('OpsSpecExecutor.execute()') + ' 로 실제 데이터에 '
                 '돌려, 결과를 다음 step LLM 에 보여주고 ref 가 유효한지 확인. 외부 재현 스크립트 ' + mono('scripts/he_execute.py') +
                 ' / ' + mono('he_validate.py') + ' 가 같은 실행기를 사용.')]
    s += [bullet('<b>참조 무결성</b>: 모든 ' + mono('"ref:nN"') + '·' + mono('meta.inputs') + ' 가 존재하는 노드를 가리키는지 '
                 '검사 (' + mono('main.py') + ' — ' + mono('validate_refs_against_node_ids()') + ').')]

    # ══════════════════════════════════════════════════════════════════════════
    #  PART C
    # ══════════════════════════════════════════════════════════════════════════
    s += [PageBreak()]
    s += part('C', 'Explanation Visualizer  (spec → 시각적 설명)')
    s += [sec('C-1. 단계 구성')]
    s += [tbl([
        ['#', '단계', '파일 / 함수'],
        ['1', '그룹 정규화 (ops/ops2 → 정렬된 그룹열)', mono('src/domain/operation/opsSpec.ts')+' — '+mono('normalizeOpsGroups()')],
        ['2', '차트 타입 디스패치 + 초기 SVG 렌더', mono('src/rendering/renderChart.ts')+' → '+mono('src/rendering-new/instances/*Instance.ts')],
        ['3', 'ops 디스패치 → 차트별 runner', mono('src/operation-next/runChartOps.ts')+' — '+mono('runChartOps()')+', '+mono('resolveRunner()')],
        ['4', '그룹·op 루프, op 마다 applier 호출', mono('src/operation-new/run{ChartType}.ts')],
        ['5', 'op 적용 = 계산 + 차트변형 + 주석 그리기', mono('src/operation-new/appliers/{chartType}/*.ts')],
        ['6', '재사용 주석 primitive 로 SVG 그리기', mono('src/operation-new/primitives/*.ts')],
    ], [0.7*cm, 6.1*cm, 9.85*cm]),
        sp(2)]
    s += [note('확인된 사실: ' + mono('runChartOps') + ' 의 ' + mono('resolveRunner()') + ' 는 5개 차트 타입 전부를 '
               + mono('src/operation-new/') + ' runner 로 보낸다. 과거 ' + mono('src/operation-next/runners/') + ' 는 사실상 '
               'dead 이고, 주석 primitive 의 live 위치도 ' + mono('src/operation-new/primitives/') + ' 다'
               '(' + mono('operation-next/primitives/') + ' 는 축소된 레거시 미러).')]

    s += [sec('C-2. 개별 operation 하나를 그리는 과정')]
    s += [body('C-2-1. <b>먼저 차트를 변형</b>한 뒤 주석을 그린다. 대표 변형:')]
    s += [bullet('<b>축 rescale / 범위 필터</b>: ' + mono('instance.transitionChartScale()') + ' — 인터페이스 '
                 + mono('src/rendering-new/chartInstance.ts:64') + ', 구현 ' + mono('instances/simpleLineInstance.ts:589') +
                 '. 단일 D3 transition 이 축 눈금 + 마크 위치 + 지속 주석을 동기 이동(깜빡임 없음). 범위 밖 마크는 opacity 로 dim/제거.')]
    s += [bullet('<b>차트 타입 스왑</b>(line→bar): ' + mono('appliers/simpleLine/sort.ts') + ' 가 선을 fade-out, 막대를 '
                 'baseline 에서 올리고 새 spec 을 저장(' + mono('storeRuntimeChartState') + ') 후 인스턴스 교체.')]
    s += [bullet('<b>stacked↔grouped 등 재인코딩</b>: ' + mono('primitives/stackComposition.ts') + ' 가 막대 구성을 모핑.')]
    s += [body('C-2-2. 결과(평균선·차이 화살표·값 라벨)는 <b>재사용 가능한 주석 primitive</b> 단위로 분리되어 있다 '
               '(' + mono('src/operation-new/primitives/') + '):')]
    s += [tbl([
        ['Primitive', '그리는 주석'],
        [mono('drawReferenceLine.ts'), '수평 reference line + 값 라벨 (average, filter 임계값). anchorValue 로 rescale 추적'],
        [mono('drawVerticalReferenceLine.ts'), '수직 안내선 (시점/범주 선택)'],
        [mono('drawDifferenceArrow.ts'), 'drawVerticalComparisonArrow(이중 화살표, diff) / drawDirectionalArrow(단방향, lagDiff·pairDiff)'],
        [mono('markSalience.ts'), 'applyMarkSalience(): in/out-of-scope opacity 전환 (chart-agnostic, isInScope predicate)'],
        [mono('annotationLayer.ts'), 'ensureAnnotationLayer(): 마크 위 고정 주석 레이어 보장 + viewport 클리핑'],
        [mono('placeValueLabel.ts / placeLabel.ts'), '충돌 회피 값/텍스트 라벨 배치, fade-in'],
        [mono('contextFade.ts / fadeRemove.ts'), '이전 주석을 context 스타일로 흐리거나 fade-out 제거'],
        [mono('drawResultBadge.ts / sequencedReveal.ts'), '결과 배지, 다중 마크 순차 등장'],
        [mono('splitDiffOverlay.ts / transitionLegend.ts'), '분할 화면 간 diff 오버레이, 범례 전환'],
    ], [5.0*cm, 11.65*cm]),
        sp(2)]
    s += [body('C-2-3. <b>강조/흐림은 별도 모듈</b>이다 (각 렌더 함수에 섞지 않음): ' + mono('primitives/markSalience.ts') +
               '. 상태는 ' + mono('ChainState.salienceMap') + ' 에 보관되어, 새 op 가 이미 흐려진 마크를 다시 흐리지 않도록 한다. '
               'op 간 맥락 전환 dimming 은 ' + mono('applyAnnotationContextFade()') + ' 가 담당.')]
    s += [body('C-2-4. <b>계산과 그리기는 분리</b>된다. 계산은 DOM 없는 순수 함수 ' + mono('src/domain/operation/dataOps.ts') +
               ' (averageData, filterData, diffData, lagDiffData …). 그리기는 applier 가 그 결과를 받아 primitive 호출. 패턴:')]
    s += [code(
'// src/operation-new/appliers/simpleLine/average.ts  (compute → draw → return)\n'
'const result  = averageData(state.workingData, operation)   // ① 계산 (pure)\n'
'const avg     = Number(result[0]?.value)\n'
'await drawReferenceLine({ layer, y: marginTop + yScale(avg),  // ② 그리기 (D3)\n'
'                          label: `Average: ${format(avg)}`, anchorValue: avg })\n'
'return { result, nextState: { ...state, lastResult: result,  // ③ 상태 반환\n'
'                              annotationRecords: [...state.annotationRecords, rec] } }')]

    s += [sec('C-3. 여러 operation 을 합성하는 과정 (DAG 합성)  ★')]
    s += [body('C-3-1. <b>전개 순서.</b> 렌더 시점에는 위상정렬을 다시 하지 않는다. 명세가 이미 의존-일관 순서로 선형화되어 '
               '있기 때문이다(노드 id 가 생성 단계에서 실행 순서대로 부여되고, ' + mono('normalize') + ' 가 nodeId 숫자순 정렬). '
               '런타임은 그룹 순서(' + mono('normalizeOpsGroups') + ') → 그룹 내 배열 순서로 전개하고, 데이터 의존은 '
               + mono('meta.inputs') + ' 로 그때그때 해소한다. (DAG 위상정렬 자체는 Generator 의 ' + mono('scheduler.py') + ' 가 수행.)')]
    s += [body('C-3-2. <b>결과 이어받기.</b> ' + mono('ChainState') + ' 가 op→op 으로 전달되고, 각 op 직전 '
               + mono('stateWithOperationDependencies()') + ' (' + mono('executionState.ts:196') + ') 가 ' + mono('meta.inputs') +
               ' 의 데이터 의존을 결과 저장소에서 꺼내 ' + mono('workingData') + ' 로 주입한다. 그룹 루프는 ' + mono('clearGroupBoundary') +
               ' 로 시각 상태만 리셋하고 데이터 범위는 유지한다.')]
    s += [body('C-3-4. <b>팬아웃(공유 결과).</b> 여러 후속 step 이 한 결과를 참조하면, 그 주석을 ' + mono('RESULT_REF_ATTRIBUTE') +
               ' 로 태깅해 삭제하지 않는다. ' + mono('computeLiveReferencedIds()') + '/' + mono('isOperationResultReferenced()') +
               ' (' + mono('diffEndpoint.ts') + ') 가 “아직 참조됨” 인 주석만 살려둔다. 예: 두 평균선이 diff 화살표의 양 끝점으로 동시에 유지.')]
    s += [body('C-3-3. <b>Side-by-side(분할 화면).</b> 구현되어 있다. ' + mono('src/api/visual-execution-player.ts') +
               ' 의 substep ' + mono('surfaceAction:"split"') + ' 가 좌/우 surface 를 만들어 ' + mono('ops1/ops2') +
               ' 를 각각 ' + mono('runChartOps') + ' 로 돌리고, ' + mono('src/operation-next/splitSurfaceVisuals.ts') + ' 의 '
               + mono('applySplitSharedYAxisPolicy()') + ' 가 두 패널의 y축을 정렬, ' + mono('tryDrawSplitScalarDiffAnnotation()') +
               ' 가 패널 사이 간격을 가로지르는 diff 화살표를 그린다. 독립적 두 계산의 병렬 제시에 쓰인다.')]

    s += [sec('C-4. 마무리')]
    s += [body('C-4-1. 별도의 “결론” 렌더 단계는 없다. <b>마지막 op 의 주석이 그대로 결론</b>이 되고, 팬아웃 메커니즘이 '
               '결론 장면을 자동 구성한다: diff 가 앞선 두 피연산자(예 두 평균선)를 ' + mono('"ref:nN"') + ' 으로 참조하면 그 선들이 '
               '삭제되지 않고 화살표의 양 끝으로 남아 “무엇과 무엇의 차이인가”를 함께 보여준다. 살릴 결과는 ' + mono('runChartOps') +
               ' 옵션 ' + mono('referencedResultIds / futureReferencedResultIds') + ' 로 미리 선언된다. 시각 실패 대비 텍스트 요약은 '
               + mono('src/api/operation-summary-text.ts') + ' 가 생성.')]

    # ══════════════════════════════════════════════════════════════════════════
    #  PART D
    # ══════════════════════════════════════════════════════════════════════════
    s += [PageBreak()]
    s += part('D', '구현 세부  (Implementation Notes)')
    s += [body('D-1. <b>비동기다.</b> 단계 전개는 ' + mono('async/await') + ' 로 직렬화된다. 이유: D3 transition 이 비동기'
               '(' + mono('transition().end()') + ' 가 Promise)라서, 축 rescale 애니메이션이 끝나야 정확한 y 좌표를 읽어 주석을 '
               '제 위치에 놓을 수 있다(축이 튀지 않는 핵심). 순서 보장은 op 루프가 각 ' + mono('applier.apply()') + ' 를 ' +
               mono('await') + ' 하고, applier 내부도 ' + mono('await transitionChartScale → await drawReferenceLine') +
               ' 순으로 await 체인을 이룬다. 멀티-문장 재생은 ' + mono('visual-execution-player.ts') + ' 의 ' +
               mono('runVisualSentenceStep()') + ' (전부 async)가 substep 마다 ' + mono('runOps') + ' 를 순차 await.')]
    s += [code(
'await applyMarkSalience(...)            // ① 흐림 전환 완료 대기\n'
'await instance.transitionChartScale(...)  // ② 축+마크 위치 전환 완료 대기\n'
'await drawReferenceLine(...)            // ③ 그제서야 확정된 y 좌표로 주석 배치')]
    s += [body('D-2. <b>주요 라이브러리.</b>')]
    s += [tbl([
        ['역할', '기술'],
        ['차트 렌더링', 'D3.js (scale · axis · transition · selection) — Vega 런타임 미사용, spec 만 Vega-Lite 형식'],
        ['UI', 'React + TypeScript (Vite 번들)'],
        ['NLP / LLM', 'FastAPI (Python) · structured-output LLM (OpenAI HTTP 또는 로컬 Ollama, 교체 가능) · Pydantic'],
        ['비동기 제어', 'Promise / async-await (D3 transition.end())'],
        ['상태 관리', '전역 store 없음 — ChainState 를 plain object 로 명시적 전달'],
        ['테스트', 'Playwright (e2e)'],
    ], [3.6*cm, 13.05*cm]),
        sp(3)]
    s += [body('D-3. <b>설계상 결정·제약.</b>')]
    s += [bullet('지원 차트 타입은 5종으로 고정: simple/grouped/stacked bar, simple/multiple line (' + mono('ChartType') +
                 ', ' + mono('src/domain/chart/') + '). 그 외 타입은 비범위.')]
    s += [bullet('실행 가능한 atomic op 은 18종으로 닫힌 문법(' + mono('op_registry.py') + '). 표현 한계가 데이터에 드러난다 — '
                 'gold 코퍼스에서 group-by-aggregate-then-extremum(예 “연도별 합 최댓값”) 류는 한 체인으로 표현 불가(GAP) 로 표시됨'
                 ' (' + mono('scripts/he_specs.py') + ' 의 ' + mono('None') + ' 항목·노트).')]
    s += [bullet('명세는 차트별 컨텍스트(primary measure/dimension, series field)에 grounding 되어야 실행된다 — 같은 op 도 '
                 '차트 방향(예 grouped bar 의 series=primary dimension)에 따라 표현 가능/불가가 갈린다.')]
    s += [bullet('스칼라 참조는 반드시 문자열 ' + mono('"ref:nN"') + ' 형식만 허용(객체 ' + mono('{id:"nN"}') + ' 금지) — '
                 + mono('runtime/artifacts.py') + ' 가 강제.')]

    # ══════════════════════════════════════════════════════════════════════════
    #  PART E
    # ══════════════════════════════════════════════════════════════════════════
    s += [PageBreak()]
    s += part('E', '다이어그램 · 대표 예시')
    s += [sec('E-1. 시스템 구조 다이어그램 (실제 구조 반영 배치)')]
    _arch = diagram_architecture()
    _f = 0.84                      # shrink so banner + header + diagram + caption share one page
    _arch.scale(_f, _f)
    _arch.width, _arch.height = 478 * _f, 706 * _f
    _arch.hAlign = 'CENTER'
    s += [_arch]
    s += [cap('그림 E-1. 입력 → Specification Generator(4 내부 단계) → Specification(중간 DAG) → '
              'Explanation Visualizer(4 내부 단계, op 마다 반복) → 출력. '
              'Generator=Python/LLM, Visualizer=TS/D3, 둘을 잇는 것은 OpsSpec DAG 하나뿐.')]

    s += [sec('E-2. 대표 예시 — 입력부터 출력까지 (carry-through)')]
    s += [body('차트 ' + mono('avwb8xstxx1lmfpk') + ' (단일 시리즈 line, Year × CPI). 본 논문 전체에서 끌고 갈 예시.')]
    s += [tbl([
        ['단계', '데이터 / 산출물'],
        ['입력 — 차트', 'Vega-Lite line spec: Year(x) × Consumer Price Index(y), 단일 시리즈'],
        ['입력 — 질문', '“What is the Year that has the biggest deviation from the total average?”'],
        ['입력 — explanation', '“1. Find the average CPI.  2. Calculate deviation from each data point.  3. Find the biggest deviation.”'],
        ['Generator 출력 — OpsSpec', '아래 JSON (3 문장 → ops/ops2/ops3, 선형 체인 + 스칼라 ref 엣지)'],
        ['Visualizer step 1 (n1)', '전체 평균을 수평 reference line 으로 표시 — “Average: …”'],
        ['Visualizer step 2 (n2)', '각 점의 |값 − 평균| 을 편차로 강조(평균선 유지). targetValue="ref:n1" 로 n1 결과 사용'],
        ['Visualizer step 3 (n3)', '최대 편차의 연도를 강조 → 최종 답. 평균선·편차가 함께 남아 결론 장면 구성'],
        ['출력', '위 주석이 누적된 SVG (단계별 시각적 설명)'],
    ], [3.4*cm, 13.25*cm]),
        sp(3)]
    s += [code(
'{\n'
'  "ops":  [ {"op":"average",     "id":"n1","meta":{"nodeId":"n1","inputs":[],     "sentenceIndex":1},\n'
'             "field":"Consumer Price Index (100 = 1982-1984)"} ],\n'
'  "ops2": [ {"op":"diffByValue", "id":"n2","meta":{"nodeId":"n2","inputs":["n1"], "sentenceIndex":2},\n'
'             "targetValue":"ref:n1","signed":false,\n'
'             "field":"Consumer Price Index (100 = 1982-1984)"} ],\n'
'  "ops3": [ {"op":"findExtremum","id":"n3","meta":{"nodeId":"n3","inputs":["n2"], "sentenceIndex":3},\n'
'             "which":"max"} ]\n'
'}')]
    s += [body('데이터 형태 변환 요약: NL 텍스트 → (Generator) op task 목록 → 노드+엣지가 부착된 OpsSpec DAG → '
               '(Visualizer) 각 노드가 ' + mono('DatumValue[]') + ' 결과로 실행되며 차트 위 주석으로 누적. '
               'n1 의 스칼라 결과(평균)가 ' + mono('"ref:n1"') + ' 을 통해 n2 로, n2 의 마크집합(편차)이 ' + mono('meta.inputs=["n2"]') +
               ' 를 통해 n3 으로 흐른다.')]
    s += [sp(6), hr(C_BORDER, 0.5)]
    s += [note('본 문서의 모든 경로·심볼은 저장소 코드에서 직접 확인했다. 대표 근거: ' +
               mono('operationSpecs.ts') + ', ' + mono('opsSpec.ts') + ', ' + mono('chainState.ts') + ', ' +
               mono('executionState.ts') + ', ' + mono('diffEndpoint.ts') + ', ' + mono('dataOps.ts') + ', ' +
               mono('operationCategory.ts') + ', ' + mono('runChartOps.ts') + ', ' + mono('operation-new/appliers/*') + ', ' +
               mono('operation-new/primitives/*') + ' (Visualizer); ' + mono('nlp_server/opsspec/pipeline.py') + ', ' +
               mono('module_inventory.py') + ', ' + mono('module_step_compose.py') + ', ' + mono('grounding.py') + ', ' +
               mono('op_registry.py') + ', ' + mono('executor.py') + ', ' + mono('scheduler.py') + ', ' + mono('normalize.py') +
               ' (Generator).')]
    return s


# ── Page furniture ───────────────────────────────────────────────────────────
def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont('KR', 7.5)
    canvas.setFillColor(C_GRAY)
    canvas.drawString(2*cm, 1.1*cm, 'Explanation Representation & System — code-grounded reference')
    canvas.drawRightString(W - 2*cm, 1.1*cm, '%d' % doc.page)
    canvas.setStrokeColor(C_BORDER)
    canvas.setLineWidth(0.4)
    canvas.line(2*cm, 1.4*cm, W - 2*cm, 1.4*cm)
    canvas.restoreState()


OUT = os.path.expanduser('~/Desktop/explanation_representation_and_system.pdf')
doc = SimpleDocTemplate(
    OUT, pagesize=A4,
    leftMargin=2*cm, rightMargin=2*cm, topMargin=1.8*cm, bottomMargin=1.8*cm,
    title='Explanation Representation & System', author='Taewon Yoo',
)
doc.build(content(), onFirstPage=on_page, onLaterPages=on_page)
print('PDF saved:', OUT)
