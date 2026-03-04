# Explanation Visualizer Pipeline (Paper-Ready, Code-Agnostic)

이 문서는 코드(구현)를 읽지 않는 독자(리뷰어/교수)를 대상으로, **Explanation Visualizer(=Explanation Generator의 실행·시각화 단계)** 가 무엇을 입력으로 받아 어떤 원리로 **단계적(step-by-step) 시각적 설명(visual explanation)** 을 생성하는지 “논문에 바로 옮겨 적을 수 있는 수준”으로 서술합니다.  
이 문서의 목표는 단순 기능 나열이 아니라, **왜 이런 컴포넌트가 존재해야 하는지**, 그리고 **어떤 책임이 어떤 순서로 분리되어 있는지**를 명확히 드러내는 것입니다.

> 범위(scope)  
> - 본 문서는 “시각적 설명을 화면에 구성/실행하는 단계”에 집중합니다.  
> - 자연어 → OpsSpec(=VIZSPEC) 생성(LLM/grammar synthesis)은 `nlp_server/paper_specification_generator.md`가 다룹니다.  
> - 웹 UI(설문/워크벤치) 세부 구현은 제외합니다.

---

## 1) 문제 정의: “연산적 추론”을 “시각적 내러티브”로 바꾸기

### 1.1 입력(Input)
Explanation Visualizer는 다음 입력을 받습니다.

1) **차트 사양(Chart Spec)**  
Vega-Lite 형태의 스펙(마크 타입, 인코딩 필드, 데이터 등).  

2) **연산 프로그램(OpsSpec / VIZSPEC program)**  
자연어 설명을 “기계 실행 가능한 연산 시퀀스”로 번역한 것.  
핵심은 **(a) 데이터 연산(Data Ops)** 과 **(b) 시각 연산(Draw Ops)** 를 동일한 컨테이너에서 다룬다는 점입니다.

- Data Ops 예: `filter`, `sum`, `average`, `diff`, `findExtremum` …  
- Draw Ops 예: `highlight`, `dim`, `text`, `line`, `split`, `group-filter` …

OpsSpec는 보통 여러 “그룹(group)”으로 나뉘며(예: `ops`, `ops2`, `ops3`, `last`), 각 그룹은 자연어 설명의 **문장/단계**와 1:1로 대응하도록 설계할 수 있습니다.

### 1.2 출력(Output)
출력은 단일 수치나 텍스트가 아니라, 다음의 결합입니다.

- **렌더링된 차트(Chart View)**: 기본 차트 + 필요 시 분할 뷰(split view)·재배열·필터링 뷰 등
- **시각적 내러티브(Visual Narrative)**: 단계별로 생성·삭제되는 강조/흐림/주석(텍스트·선·사각형·세그먼트 등)과 뷰 전환

즉, Explanation Visualizer는 “정답”을 직접 생성하기보다, **연산의 중간 결과와 논리적 순서를 사용자가 따라갈 수 있도록** 차트 위에 시각적 흔적을 구성합니다.

---

## 2) 설계 목표(Design Goals)

Explanation Visualizer는 연구 프로토타입에서 특히 중요한 요구를 만족하도록 설계됩니다.

1) **Stepwise interpretability**  
한 번에 모든 시각적 단서를 덮어씌우지 않고, 연산 단계에 맞춰 **순차적으로** 제시해 “논리의 순서”를 시각적으로 드러냅니다.

2) **Determinism / Reproducibility**  
동일한 차트와 동일한 OpsSpec 입력은 **동일한 실행 순서와 동일한 시각적 결과**를 만들어야 합니다(실험/재현성 관점).

3) **Separation of concerns**  
데이터 처리(무엇을 계산할 것인가)와 시각 합성(어떻게 보여줄 것인가)을 분리합니다.  
이 분리는 (a) 확장 용이성, (b) 오류 격리, (c) 논문 서술 가능성을 높입니다.

4) **Small primitive vocabulary**  
시각적 설명은 제한된 “원자적 드로잉 액션(primitives)”으로 구성됩니다(하이라이트, 텍스트 주석, 기준선, 영역 강조 등).  
이는 VIZSPEC(문법)과 실행기의 계약(contract)을 단순화합니다.

5) **Chart-type modularity**  
차트 종류(단일 막대/누적 막대/그룹 막대/단일 선/다중 선)에 따라 기하(geometry)와 선택(selector)이 달라지므로,  
렌더러/핸들러를 차트 타입별 모듈로 분리하되, 상위 실행 루프는 동일하게 유지합니다.

6) **Fail-fast on unsupported visuals**  
지원하지 않는 draw action이 들어오면 “조용히 무시”하기보다, 실행 전에 capability 검사로 명시적으로 드러내는 것이 실험 안정성에 유리합니다.

---

## 3) 핵심 표현(Contracts): 데이터·연산·시각 액션의 공통 언어

### 3.1 정규화된 작업 데이터: `DatumValue[]`
Explanation Visualizer는 차트 원본 행(row)을 그대로 계산하지 않고, 연산을 위해 **정규화된 데이터 모델**로 변환합니다.

각 datum은 다음 정보를 갖는다고 가정합니다.

- `target`: x축에 표시되는 실제 레이블(문자열로 정규화)  
- `value`: 연산 대상 수치(숫자)  
- `group`: 시리즈/서브그룹(없으면 `null`)  
- `category`, `measure`: 의미적 필드 라벨(예: “country”, “revenue”)  
- (선택) `id`, `lookupId`, `name` 등: 마크 선택/참조를 위한 보조 키

이 정규화는 다음을 가능하게 합니다.

- 차트 타입이 달라도 연산은 `DatumValue[] → DatumValue[]` 형태로 통일
- “필터/집계/비교” 같은 논리 연산을 시각 레이아웃과 분리

### 3.2 OpsSpec의 그룹 구조와 실행 순서
OpsSpec는 다음 중 하나 형태로 들어올 수 있으나, 실행 전에는 **그룹들의 순서 있는 리스트**로 정규화됩니다.

- 단일 op, op 배열, 혹은 `{ ops: [...], ops2: [...], last: [...] }` 같은 그룹 맵

그룹명 정렬은 재현성과 논문 서술을 위해 결정론적으로 정의할 수 있습니다. 예를 들어:

1) `ops`  
2) `ops2`, `ops3`, … (숫자 오름차순)  
3) 기타 이름(사전순)  
4) `last` (마지막 결합/검증 단계 용도)

이 구조는 자연어 설명(문장 단위)의 순서를 실행 단계와 직접 연결해 줍니다.

### 3.3 연산의 두 범주: Data Ops vs Draw Ops
Explanation Visualizer에서 연산은 크게 두 종류입니다.

#### (A) Data Ops: 분석적 의미를 갖는 연산
Data Ops는 “무엇을 계산하는가”를 정의합니다.  
모든 Data Op는 원칙적으로 다음 형태의 함수로 생각할 수 있습니다.

\[
f_o: \mathcal{D} \rightarrow \mathcal{D}
\]

여기서 \(\mathcal{D}\)는 `DatumValue[]`(현재 working set)이고, 결과 역시 `DatumValue[]`입니다(스칼라도 길이 1 배열로 표현).

대표 예시:
- `retrieveValue`: 특정 target(및 group) 슬라이스 선택  
- `filter`: 조건(연산자/임계값) 또는 include/exclude로 working set 축소  
- `sum`, `average`, `count`: 집계 결과(스칼라 datum) 생성  
- `diff`, `compare`, `compareBool`: 두 대상의 차/비교 결과 생성  
- `sort`, `nth`, `lagDiff`, `determineRange` 등

#### (B) Draw Ops: 시각적 의미를 갖는 연산
Draw Ops는 “어떻게 보여줄 것인가”를 정의합니다.  
예를 들면 특정 마크를 붉게 강조하거나, 기준선을 그리거나, 차트를 split view로 바꾸는 행동입니다.

Draw Op는 기본적으로 다음을 포함합니다.
- `action`: 시각 액션 타입(예: `highlight`, `text`, `line`, `split`, `filter` …)  
- `select`: 어떤 마크를 대상으로 할지(`keys`, `mark`)  
- `style`: 색/투명도/두께 등  
- (선택) `chartId`: split view에서 특정 서브차트를 겨냥

### 3.4 선택자(Selectors)와 의미적 타깃팅
시각적 설명에서 “어떤 요소를 가리키는가”는 핵심입니다.  
Explanation Visualizer는 이를 위해 차트 렌더링 단계에서 마크에 **data-attribute 기반의 태깅**을 부여하고, Draw Op는 해당 키를 사용해 선택합니다.

- 막대 차트: 각 rect에 `data-target`(x 레이블), `data-value`(y), `data-id` 등을 부여  
- 선 차트: path/point에 `data-target`(x 레이블), `data-value`(y) 등을 태깅(temporal이면 ISO date로 정규화)  

이렇게 하면 “도형의 픽셀 좌표”를 몰라도, **데이터 키(레이블/값/시리즈)** 로 안정적으로 선택할 수 있습니다.

### 3.5 Runtime Result Store: 단계 간 참조를 위한 최소 메모리
복합 질문은 중간 결과를 참조하는 연산이 필수입니다(예: 두 집계 결과를 비교).  
Explanation Visualizer는 각 Data Op 실행 결과를 런타임 저장소에 캐시해 다음 연산이 참조할 수 있게 합니다.

가장 단순하면서 재현 가능한 참조 방법은:

- **스코프 기반 키**: `"<groupName>_<opIndex>"`  
  - 예: `ops_1`(그룹 `ops`의 두 번째 연산 결과), `ops2_0`(그룹 `ops2`의 첫 연산 결과)

이 키는 “연산 그래프”의 nodeId를 몰라도, **실행 순서 기반으로** 안전하게 재사용 가능합니다.  
또한 그룹 간(runtime reset 없이) 결과를 공유할 수 있어, 마지막 결합 단계(`last`)에서 이전 그룹의 결과를 비교하는 패턴을 자연스럽게 지원합니다.

---

## 4) 핵심 구성 요소와 존재 이유 (서술형 아키텍처)

Explanation Visualizer는 “입력 프로그램 실행”과 “시각적 합성”을 분리한 파이프라인으로 구성됩니다.

### 4.1 Chart Type Resolver & Spec Normalizer
동일한 OpsSpec라도, 차트 타입이 달라지면 실행 가능한 draw action과 선택 가능한 마크가 달라집니다.  
따라서 실행은 다음 전처리를 갖습니다.

- 차트 타입 추론(예: 단일 막대/누적/그룹/선/다중선)
- 스펙 정규화(폭/높이/패딩/색상 팔레트 등 기본값을 보정)

이 단계는 후속 모듈이 “차트 타입에 의존하지 않는 계약”으로 동작할 수 있게 합니다.

### 4.2 Renderer Adapter (Chart Rendering)
Explanation Visualizer는 **SVG 기반 차트 표현**을 전제로 합니다(오버레이·선택·주석을 위해).  
렌더러는 차트 타입별로 서로 다를 수 있지만, 공통 목표는 다음입니다.

1) 차트를 화면에 렌더링한다.  
2) 후속 Draw Handler가 사용할 수 있도록, 마크에 `data-target/data-value/...` 같은 태깅을 제공한다.  
3) split view 같은 뷰 변환이 발생하면, 동일한 컨테이너에서 두 개의 서브차트를 안정적으로 구분(`chartId`) 가능하게 한다.

### 4.3 Working Data Extractor & Normalizer
시각적 설명은 “차트가 보여주는 데이터”와 정합해야 합니다.  
따라서 실행기는 렌더된 차트(또는 렌더러가 저장한 raw rows)로부터 현재 working set을 구성합니다.

핵심은 **연산 입력 데이터(working set)는 항상 `DatumValue[]`로 통일**된다는 점입니다.  
이 통일 덕분에, 동일한 `filter/sum/diff` 연산이 막대/선 차트 모두에서 의미적으로 일관되게 정의됩니다.

### 4.4 Operation Executor (Data Ops Engine)
Data Ops 엔진은 각 연산을 “순수한 데이터 변환”으로 실행합니다.

- 입력: 현재 working set  
- 출력: 다음 working set  
- 부수효과(side effect): 런타임 저장소(runtime store)에 결과 캐시

이 모듈은 시각화를 직접 그리지 않습니다. 즉, “계산”과 “표현”을 분리합니다.

### 4.5 Visual Synthesis: (Auto) Draw Plan Builder
설명은 계산만으로 완성되지 않습니다. 사용자가 이해할 수 있도록 **시각적 내러티브**로 변환해야 합니다.

이를 위한 두 가지 전략이 공존할 수 있습니다.

1) **Auto Draw Plan(규칙 기반 시각화)**  
특정 차트 타입(예: 단일 막대)에서는 Data Op 결과를 입력으로 받아, 그 연산을 설명하는 draw action 시퀀스를 자동으로 생성합니다.  
예: `filter` 결과 → (기준선) → (조건 만족 구간 세그먼트 강조) → (필터된 뷰로 전환)

2) **Explicit Draw Ops(명시적 시각화)**  
어떤 차트 타입에서는 자동 규칙을 구현하지 않거나, 더 세밀한 제어가 필요할 수 있습니다.  
이 경우 OpsSpec 자체가 draw action을 포함하여 “어떻게 보여줄지”를 직접 지정합니다.

중요한 점은, 두 방식 모두 최종적으로는 **동일한 Draw Op primitive 집합**으로 표현되어 같은 실행기에서 처리된다는 것입니다.

### 4.6 Draw Plan Executor & Draw Handlers
Draw Op는 두 계층으로 실행됩니다.

1) **차트-특화 Draw Handler**  
막대/선 등 기하가 다른 마크를 “키 기반으로 선택”하고, highlight/dim/sort/filter 같은 동작을 해당 차트의 DOM 구조에 맞게 수행합니다.

2) **차트-불변 Generic Overlay Renderer**  
텍스트, 선, 사각형 같은 주석은 공통 오버레이 레이어(annotation layer)에 추가합니다.  
이 레이어는 base chart geometry와 분리되어 “설명 흔적”을 독립적으로 지울 수 있습니다.

### 4.7 Capability Guard (Support Matrix)
모든 draw action이 모든 차트에서 가능한 것은 아닙니다.  
예를 들어 `line-trace`는 선 차트에서만 의미가 있고, `bar-segment`는 막대에서만 의미가 있습니다.

따라서 실행 전 다음을 검사합니다.

- action 이름이 알려진 primitive인가?
- 현재 차트 타입에서 지원되는가?

지원되지 않는 액션이 섞이면 fail-fast로 오류를 드러내, 실험 중 “아무것도 안 보이는” 침묵 실패를 줄입니다.

---

## 5) 실행 흐름(Execution Flow): 단계별 내러티브 생성

Explanation Visualizer의 실행을 “독자가 머릿속으로 시뮬레이션할 수 있게” 서술하면 다음과 같습니다.

### 5.1 전처리
1) 차트 타입을 추론한다.  
2) 스펙을 정규화한다(기본 레이아웃/스타일 안정화).  
3) OpsSpec를 그룹 단위로 정규화하고 순서를 확정한다.  
4) OpsSpec 내 draw action들이 해당 차트에서 지원되는지 검사한다.

### 5.2 그룹 루프: 문장/단계 단위 실행
각 그룹(예: `ops`, `ops2`, …)은 하나의 설명 단계로 볼 수 있습니다.

그룹 \(g\)를 실행할 때:
1) 차트를 렌더링(또는 필요한 경우 초기화)한다.  
2) base working set \(W_0\)를 구성한다.  
3) 주석 레이어를 정리(clear)하고, draw handler를 준비한다.  
4) 그룹 내 연산 리스트를 순서대로 실행한다.

런타임 저장소는 기본적으로 첫 그룹에서 초기화하고, 이후 그룹에서는 유지하여(=reset하지 않음) 그룹 간 참조를 허용할 수 있습니다.

### 5.3 연산 루프: sleep / draw / data
그룹 내부에서 각 연산 \(o_t\)는 다음 규칙으로 처리됩니다.

#### (1) Sleep
`sleep`은 내러티브 pacing을 위한 제어 연산입니다.  
시각적 변화 사이에 짧은 정지를 삽입해 사용자가 다음 변화에 주의를 옮길 시간을 제공합니다.

#### (2) Draw Op
Draw Op는 working set을 바꾸지 않고, **표현만** 바꿉니다.

- 단순 오버레이/스타일 변경: highlight/dim/text/line/rect/clear …
- 뷰 변환(view transform): split/unsplit, grouped/stacked 전환, 그룹 필터링 등  
  - 이 경우 차트를 재렌더링하고(또는 구조를 변환하고), 핸들러/부분 상태를 재설정합니다.

#### (3) Data Op
Data Op는 working set을 바꾸고, 필요 시 그 연산을 설명하는 draw-plan을 동반합니다.

1) 입력 working set을 결정한다(필요 시 split view의 `chartId`로 subset을 선택).  
2) Data Op를 실행해 결과 \(W_{t+1}\)를 얻는다.  
3) 결과를 런타임 저장소에 캐시한다(예: `ops_0`, `ops_1` …).  
4) (옵션) Auto Draw Plan이 정의되어 있다면, \(W_{t+1}\) 및 컨텍스트(\(W_t\))로부터 draw op 시퀀스를 생성한다.  
5) 생성된 draw plan을 실행한다.

이 과정을 통해 사용자는 “계산이 먼저 일어나고, 그 계산을 설명하는 시각적 단서가 이어진다”는 구조를 경험합니다.

---

## 6) 수학적/논리식 표현: 실행 의미론(Operational Semantics)

연산 시퀀스를 \(O = [o_1, \dots, o_T]\)라 두고,

- \(W_t\): t번째 연산 직후의 working data (`DatumValue[]`)  
- \(V_t\): t번째 연산 직후의 visual state(차트+오버레이 상태)  

로 정의합니다.

### 6.1 Data Op
Data Op \(o_t\)의 의미론은:

\[
W_t = f_{o_t}(W_{t-1})
\]

그리고 시각 합성 함수 \(g_{o_t}\)가 존재한다면(=auto draw plan 가능):

\[
P_t = g_{o_t}(W_t, o_t, W_{t-1})
\]
\[
V_t = \text{ApplyDrawPlan}(V_{t-1}, P_t)
\]

### 6.2 Draw Op
Draw Op는 working data를 보존하고:

\[
W_t = W_{t-1}
\]

visual state만 변화시킵니다.

\[
V_t = \text{ApplyDraw}(V_{t-1}, o_t)
\]

### 6.3 Runtime Store와 참조
각 Data Op 결과는 키 \(k_t\)로 저장됩니다.

\[
R[k_t] \leftarrow W_t
\]

이후 연산의 입력 파라미터(예: `targetA`, `targetB`)가 문자열 키를 포함하면,
해당 키를 통해 \(R[\cdot]\)에서 결과를 조회하여 연산의 데이터 슬라이스로 사용할 수 있습니다.

---

## 7) 시각적 설명 패턴(Visual Mapping Patterns)

이 절은 “어떤 연산이 왜 어떤 시각적 패턴으로 표현되는가”를 논문 서술 관점에서 정리합니다.  
핵심은 **모든 시각적 설명이 primitive들의 짧은 시퀀스**로 구성된다는 점입니다.

### 7.1 단일 막대(Simple Bar)에서의 대표 패턴

#### (a) Retrieve / Extremum / Nth: “대상 강조 + 값 앵커링”
값을 읽거나(retrieve), 최대/최소(extremum), n번째(nth)를 찾는 연산은 공통적으로:

1) 대상 막대를 **강조(highlight)**  
2) 막대 위/근처에 **수치 텍스트(text)** 를 앵커링  

을 통해 “어떤 막대”와 “그 값”을 즉시 결합해 보여줍니다.

#### (b) Average: “통계 기준선(reference line)”
평균은 단일 값이지만, 사용자는 그 값이 축에서 어디에 위치하는지 알아야 합니다.  
따라서 평균은 y축 값에 대응하는 **수평 가이드라인(line)** 으로 제시됩니다.

#### (c) Filter(임계값): “임계값 → 포함 구간 → 결과 뷰”
필터는 조건(임계값)과 결과(남는 항목)를 모두 보여야 합니다.  
대표 내러티브는 다음 3단계입니다.

1) 임계값 y에 **수평 기준선(line)** 을 그림  
2) 조건을 만족하는 막대 부분을 **세그먼트(bar-segment)** 로 강조  
3) 오버레이를 정리(clear)한 뒤, **필터된 뷰(filter view)** 로 전환

이 시퀀스는 “조건이 무엇인지”와 “왜 남았는지”를 동시에 전달합니다.

#### (d) Diff/Compare: “두 대상 + 기준선 + 차이 영역”
두 값을 비교할 때, 차이(difference)는 “두 막대의 높이 차”로 직관적으로 표현될 수 있습니다.

1) 두 대상 막대를 함께 highlight  
2) 작은 값 위치에 기준선(line)  
3) 큰 막대의 초과 구간을 bar-segment로 강조

이를 통해 사용자는 “어느 것이 더 크고, 얼마나 더 큰가”를 시각적으로 읽습니다.

#### (e) Sort: “구조 변화는 먼저 clear 후 재배치”
정렬은 차트의 공간 구조 자체를 바꾸므로, 이전 주석을 남기면 혼란을 줍니다.  
따라서 일반적으로:

1) clear로 주석을 정리  
2) sort로 막대/축 눈금을 재배열  

하는 패턴을 사용합니다.

#### (f) Sum: “일시적 집계 뷰(aggregate rendering)”
합계는 개별 막대가 아니라 “총량”을 보여야 합니다.  
따라서 합계는 잠시 차트를 **집계 전용 뷰**로 바꾸거나, 합계 막대를 렌더링하는 방식으로 제시할 수 있습니다.

### 7.2 선 차트(Line)에서의 대표 패턴
선 차트에서 highlight는 막대처럼 fill 색을 바꾸기 어렵습니다.  
따라서 특정 데이터 포인트 위에 점(오버레이 circle)을 추가하거나, 구간을 line-trace로 따라가는 방식이 자연스럽습니다.

- `line-trace`: 두 x-레이블 사이의 구간을 따라 선/점으로 강조(“이 구간을 보라”)
- `line-to-bar`: 특정 설명 단계에서 선을 막대로 변환해 값 비교를 용이하게 하는 view transform(필요 시)

### 7.3 누적/그룹 막대(Stacked/Grouped)에서의 뷰 변환 패턴
누적/그룹 막대는 “시리즈(색상 그룹)”가 핵심 축이므로, 설명 단계에서 특정 시리즈만 남기거나(reset 포함) 형태를 변환하는 액션이 유용합니다.

- `stacked-filter-groups` / `grouped-filter-groups`: 특정 시리즈만 남겨 맥락을 줄이고 집중을 유도  
- `stacked-to-grouped` / `grouped-to-stacked`: 합/비교의 목적에 맞게 레이아웃을 전환

---

## 8) JSON 예시 (논문용)

아래 예시는 “코드를 몰라도” 실행 의미를 이해할 수 있도록, 필드 의미가 드러나는 수준으로 작성했습니다.

### 8.1 예시 A: 단일 막대 — 자동 시각화가 가능한 Data Ops
```json
{
  "ops": [
    { "op": "retrieveValue", "field": "metres", "target": "Cima di Posta" },
    { "op": "findExtremum", "field": "metres", "which": "min" }
  ]
}
```

해석:
- 1단계: 특정 막대(Cima di Posta)를 선택해 값을 확인(강조 + 값 텍스트)  
- 2단계: 전체에서 최소를 찾고 해당 막대를 강조(최솟값 설명)

### 8.2 예시 B: 그룹 분리 + 런타임 키 참조로 최종 비교
```json
{
  "ops": [
    { "op": "filter", "field": "Medal", "operator": "==", "value": "Gold" },
    { "op": "sum", "field": "Count" }
  ],
  "ops2": [
    { "op": "filter", "field": "Medal", "operator": "in", "value": ["Silver", "Bronze"] },
    { "op": "sum", "field": "Count" }
  ],
  "last": [
    { "op": "compareBool", "field": "value", "targetA": "ops_1", "targetB": "ops2_1", "operator": ">" }
  ]
}
```

핵심 아이디어:
- `ops_1`은 “첫 그룹의 2번째 연산(sum) 결과”  
- `ops2_1`은 “두 번째 그룹의 2번째 연산(sum) 결과”  
- `last` 그룹은 이전 그룹들의 캐시를 참조하여 최종 비교를 수행

### 8.3 예시 C: 명시적 Draw Plan — 누적 막대에서 “특정 시리즈 평균선” 강조
```json
{
  "ops": [
    { "op": "draw", "action": "clear" },
    {
      "op": "draw",
      "action": "stacked-filter-groups",
      "groupFilter": { "groups": ["Broadcasting"] }
    },
    {
      "op": "draw",
      "action": "line",
      "line": {
        "mode": "horizontal-from-y",
        "hline": { "y": 211.95 },
        "style": { "stroke": "#ef4444", "strokeWidth": 2, "opacity": 1 }
      }
    },
    {
      "op": "draw",
      "action": "stacked-filter-groups",
      "groupFilter": { "reset": true }
    }
  ]
}
```

해석:
- 해당 단계에서는 데이터 연산이 아니라, “무엇을 보여줄지”가 이미 결정되어 있으므로 draw ops만으로 내러티브를 구성합니다.  
- 특정 시리즈만 남기고 평균선을 보여준 뒤, 원래 뷰로 복귀합니다.

### 8.4 예시 D: Split view + chartId로 서브차트 타깃팅
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "split",
      "split": {
        "by": "x",
        "groups": { "A": ["Jan", "Feb", "Mar"], "B": ["Apr", "May", "Jun"] },
        "orientation": "horizontal"
      }
    },
    { "op": "draw", "action": "highlight", "chartId": "A", "select": { "mark": "rect", "keys": ["Feb"] } },
    { "op": "draw", "action": "highlight", "chartId": "B", "select": { "mark": "rect", "keys": ["May"] } },
    { "op": "draw", "action": "unsplit" }
  ]
}
```

해석:
- 한 차트를 두 서브차트(A/B)로 분할한 뒤, 각 서브차트에 서로 다른 강조를 적용할 수 있습니다.  
- `chartId`는 “어느 뷰에서의 reasoning step인가”를 명시적으로 구분해, 병렬 비교(juxtaposition)를 가능하게 합니다.

---

## 9) 결정성(Determinism) 확보 전략

Explanation Visualizer의 결정성은 다음 레이어에서 확보됩니다.

1) **그룹 정렬 규칙의 결정성**: `ops → ops2 → ... → last` 같은 순서를 고정  
2) **순차 실행(프로그램 의미론)의 결정성**: 그룹 내 연산은 리스트 순서대로 실행  
3) **정규화된 데이터 모델**: 문자열화된 target, 수치 value를 기반으로 연산 수행  
4) **런타임 키 규칙**: `"<scope>_<index>"`로 결과 저장/참조를 표준화  
5) **오버레이 레이어 분리 + 명시적 clear**: 주석 잔존/삭제가 연산에 의해 통제됨  
6) **capability guard**: 미지원 액션은 사전에 오류로 드러나므로 “비결정적 무시”를 줄임

---

## 10) 확장성: 새로운 차트/연산/시각 패턴 추가

연구 코드가 커질수록 “확장 방식이 논리적으로 단순”해야 유지보수와 오픈소스 재사용이 가능합니다.  
Explanation Visualizer의 확장 단위는 다음 세 가지입니다.

1) **새 Data Op 추가**  
`DatumValue[] → DatumValue[]` 변환을 정의하고, (선택) 해당 연산을 설명하는 auto draw plan을 추가합니다.

2) **새 Draw Action 추가**  
primitive vocabulary에 새로운 액션을 추가하되,  
어떤 차트 타입에서 지원되는지 support matrix를 명시하고, handler/generic overlay 중 어디에서 실행할지 분리합니다.

3) **새 차트 타입 추가**  
렌더러(태깅 포함) + draw handler(선택/기하 대응) + support matrix 등록을 통해 기존 실행 루프를 유지한 채 확장합니다.

즉, “상위 실행기(run loop)는 그대로 두고”, 하위 어댑터를 교체/추가하는 방식으로 확장합니다.

---

## 11) 연구적 의미(Research Significance)

Explanation Visualizer는 “정답을 맞히는 모델”이 아니라,  
**복합 추론의 과정을 사용자가 검증 가능한 형태로 외화(externalize)** 하는 실행기입니다.

요약하면,
- VIZSPEC는 “무슨 연산을 어떤 순서로 수행하는가”를 선언하고,  
- Explanation Visualizer는 이를 “어떤 시각적 단서가 어떤 순서로 나타나야 하는가”로 구체화하여,  
- 차트 위에 단계별 내러티브로 제시합니다.

이 구조는 (1) 사용자 이해, (2) 오류 탐지, (3) 신뢰(trust) 연구를 위한 실험 조작(설명 타입/패턴 통제)을 가능하게 합니다.

---

## Appendix A) 구현 참조(선택): 모듈 책임과 위치

아래는 오픈소스 재현을 위한 구현 레퍼런스이며, 논문 본문에는 포함하지 않아도 됩니다.

- 엔트리포인트(차트 타입 분기/그룹 실행): `src/operation/run/runChartOps.ts`  
- 공통 실행 루프(ops 순차 실행): `src/application/usecases/runChartOperationsUseCase.ts`  
- 데이터 연산 정의(순수 함수 + runtime store): `src/domain/operation/dataOps.ts`  
- Draw primitive 스키마: `src/rendering/draw/types.ts`  
- Draw plan 실행기: `src/rendering/ops/executor/runDrawPlan.ts`  
- 단일 막대 auto draw plan 레지스트리: `src/rendering/ops/visual/bar/simple/autoDrawPlanRegistry.ts`
