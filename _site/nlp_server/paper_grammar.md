# Recursive Grammar Pipeline (Paper-Ready, Code-Agnostic)

이 문서는 코드 지식이 없는 독자도 이해할 수 있도록, **Recursive Grammar Pipeline**의 목적, 구성 요소, 역할, 그리고 처리 순서를 상세히 설명합니다.  
핵심은 “왜 이런 컴포넌트가 필요한지”와 “각 단계가 어떤 책임을 갖고 어떻게 연결되는지”를 명확히 드러내는 것입니다.

---

## 1) 문제 정의와 출력 형식

### 1.1 입력
입력은 두 가지입니다.
1. **자연어 질의와 설명**: 사용자가 원하는 분석을 자연어로 기술합니다.  
2. **차트 정보**: 차트 스펙과 실제 데이터 행(data rows)을 제공합니다.

### 1.2 출력
출력은 **OpsSpec(=grammar) 그래프**입니다.  
이는 “연산 노드들의 집합”과 “연산 간 의존성(엣지)”로 구성된 **방향 비순환 그래프(DAG)**입니다.

핵심 제약:
- 각 노드는 고유 ID를 가진다.  
  - 예: `n1, n2, n3, ...`  
  - ID는 실행 순서를 반영한다.  
- 노드 간 의존성은 `inputs`로 표현된다.  
  - 어떤 노드가 이전 노드의 결과에 의존하는지 명시한다.  
- 이전 노드의 **스칼라 결과**를 참조할 때는 문자열 형태의 참조를 사용한다.  
  - 예: `"ref:n1"`

이 표현은 컴퓨터가 그래프 구조를 쉽게 재구성할 수 있게 하며, 논문에서는 “연산 그래프의 결정론적 표현”으로 이해하면 충분합니다.

---

## 2) 설계 목표

1. **Graph-first**  
   모든 결과는 DAG 구조로 표현한다.  
2. **Recursive synthesis**  
   가능한 연산을 하나씩 실행하며 그래프를 점진적으로 확정한다.  
3. **결정성(Determinism)**  
   같은 입력은 같은 출력이 나오도록 설계한다.  
4. **확장성(Contract-first)**  
   새로운 연산을 추가할 때 파이프라인을 바꾸지 않고, 계약(스키마/규칙)만 추가해 확장 가능하게 한다.  
5. **Fail-fast**  
   잘못된 출력은 즉시 실패시켜 문제를 빠르게 드러낸다.

---

## 3) 핵심 구성 요소와 존재 이유 (서술형)

### 3.1 Chart Context Builder
자연어만으로는 어떤 필드가 차트에 존재하는지, 어떤 값이 도메인에 있는지 확신할 수 없습니다.  
따라서 파이프라인은 **차트 스펙과 데이터로부터 “결정론적 요약 정보”**를 먼저 구성합니다.

이 요약 정보에는 다음이 포함됩니다.
- primary_dimension (주요 축 범주)  
- primary_measure (주요 수치)  
- series_field (시리즈 구분 필드)  
- categorical domain (가능한 범주 값 목록)  
- 숫자 통계, 마크 타입 등

이 정보는 이후 모든 단계의 grounding 기준이 됩니다.

---

### 3.2 Inventory (Task Extraction)
설명문에는 여러 연산 요구가 섞여 있습니다.  
예를 들어 “A의 평균을 구한 뒤, 평균보다 큰 항목만 필터링하고, 그 중 최대를 찾는다”는 문장은 최소 3개의 연산을 담고 있습니다.

Inventory 단계는 이 설명을 읽고 **연산 태스크 집합 S(O)**를 만듭니다.
- 각 태스크는 고유 `taskId`를 가진다.  
- 같은 연산이라도 **서로 다른 문장/의도**라면 다른 태스크로 분리한다.  
- 태스크는 “어떤 연산을 해야 하는지”만 기록하며, 구체 실행은 다음 단계로 미룬다.

이는 후속 단계에서 **실행 가능한 연산을 하나씩 안정적으로 선택**할 수 있게 해 줍니다.

---

### 3.3 Step-Compose (Next Operation Proposal)
전체 그래프를 한 번에 생성하면 오류가 늘어나고 검증이 어려워집니다.  
따라서 파이프라인은 **“지금 실행 가능한 한 단계”만 선택**하도록 분리합니다.

Step-Compose 단계는 다음을 수행합니다.
- 남아 있는 태스크 중에서 현재 실행 가능한 1개를 선택한다.  
- 그 태스크에 대한 단일 연산을 제안한다.  
- 이전 결과를 참조해야 한다면 `"ref:nX"` 형태로만 참조한다.  
- 노드 ID나 메타 정보는 이 단계에서 만들지 않는다(결정론적으로 부여됨).

결과적으로, 그래프는 **한 노드씩 안정적으로 성장**합니다.

---

### 3.4 Grounding (Deterministic Normalization)
LLM 출력에는 `@primary_measure` 같은 토큰이나 모호한 도메인 값이 남아 있을 수 있습니다.  
Grounding 단계는 이를 **차트 컨텍스트 기준으로 확정**합니다.

정규화 규칙:
1. **Role token 치환**  
   - `@primary_measure` → 실제 필드명  
   - `@primary_dimension` → 실제 필드명  
   - `@series_field` → 실제 필드명  
2. **도메인 값 정규화**  
   - exact match  
   - case-insensitive match  
   - fuzzy match (필요 시)

이 단계는 결정론적 규칙만 사용하므로 **동일 입력 → 동일 출력**이 보장됩니다.

---

### 3.5 Contract & Validators
LLM 출력은 구조적으로 잘못될 수 있습니다.  
따라서 파이프라인은 연산별로 **계약(스키마/규칙)**을 정의하고, 이를 통과하지 못하면 즉시 실패합니다.

검증 내용 예시:
- 필수 필드 누락  
- 금지된 필드 포함  
- 존재하지 않는 node 참조  
- `"ref:nX"` 형식 위반

이 과정을 통해 잘못된 그래프가 확산되기 전에 빠르게 차단합니다.

---

### 3.6 Executor (Single-Step Execution)
이 파이프라인은 **“실행 가능한 노드를 하나씩 실행”**하며 그래프를 확정합니다.  
따라서 각 스텝에서 단일 연산을 실행하는 Executor가 필요합니다.

Executor의 역할:
- 단일 연산 실행  
- 결과를 runtime에 저장  
- 이후 스텝에서 참조 가능하게 함  

특징:
- 미구현 연산은 즉시 실패(fail-fast)

---

### 3.7 Artifact Summarizer
중간 결과는 크고 복잡합니다. Step-Compose가 이를 그대로 다루면 불안정합니다.  
따라서 **compact summary**로 변환합니다.

요약에는 다음이 포함될 수 있습니다.
- 결과 유형(스칼라 vs 테이블)  
- 대표 값  
- 미리보기(상위 k개)  
- 다음 연산에 필요한 최소 정보

---

### 3.8 Normalize (Meta Inputs 정규화)
연산 간 의존성이 중복되거나 순서가 일관되지 않으면 그래프 해석이 불안정해집니다.  
따라서 마지막에 다음을 정리합니다.

- meta.inputs 중복 제거  
- 정렬을 통한 안정화  
- scalar ref 의존성 자동 포함

nodeId 자체는 절대 재작성하지 않으며 **stable ID를 보존**합니다.

---

## 4) Recursive 파이프라인의 상태 변수

이 파이프라인은 **세 가지 상태**를 반복적으로 갱신하는 구조입니다.

1. **S(O)**: 남은 연산 태스크 집합  
2. **C**: 현재까지 실행된 결과 아티팩트(스칼라/테이블 요약)  
3. **G**: 지금까지 확정된 OpsSpec 그래프

초기 상태:
- `S(O)`는 Inventory 단계에서 생성  
- `C0`는 차트 컨텍스트와 원본 데이터 요약  
- `G0`는 빈 그래프

---

## 5) 수학적/논리식 표현 (간단식)

시점 `t`에서 상태를 `(S_t, C_t, G_t)`라고 두면:

1. **다음 연산 선택**  
   \[
   o_t = \text{StepCompose}(S_t, C_t)
   \]

2. **정규화 및 검증**  
   \[
   \hat{o}_t = \text{Validate}(\text{Ground}(o_t, \text{Context}))
   \]

3. **실행 및 아티팩트 갱신**  
   \[
   r_t = \text{Execute}(\hat{o}_t)
   \]
   \[
   C_{t+1} = C_t \cup \text{Summarize}(r_t)
   \]

4. **그래프 갱신**  
   \[
   G_{t+1} = G_t \cup \{\hat{o}_t, \text{edges}\}
   \]

5. **태스크 집합 갱신**  
   \[
   S_{t+1} = S_t \setminus \{o_t\}
   \]

종료 조건:
\[
S_T = \varnothing
\]
일 때 최종 그래프 \( G_T \)를 반환한다.

---

## 6) 전체 파이프라인 흐름 (서술형)

1. 먼저 차트 스펙과 데이터에서 **Chart Context**를 만든다.  
   이 컨텍스트는 이후 모든 grounding의 기준이 된다.  
2. 자연어 설명을 읽고 **연산 태스크 집합 S(O)**를 만든다.  
3. 반복 루프에 진입한다.  
   - 남은 태스크 중 하나를 선택해 단일 연산을 제안한다.  
   - 이를 컨텍스트에 맞게 정규화한다.  
   - 계약과 의미 규칙을 통해 검증한다.  
   - 단일 연산을 실행하여 결과를 얻는다.  
   - 결과는 요약되어 아티팩트 C에 추가된다.  
   - 연산은 그래프 G에 노드/엣지로 추가된다.  
4. 모든 태스크가 처리되면 meta.inputs를 정규화하고 그래프를 반환한다.

이 흐름은 “한 단계씩 실행하며 그래프를 확정”하는 재귀적 합성 방식입니다.

---

## 7) JSON 예시

### 7.1 Inventory 출력 예시
```json
{
  "tasks": [
    {
      "taskId": "o1",
      "op": "average",
      "sentenceIndex": 1,
      "mention": "average revenue for Broadcasting",
      "paramsHint": { "field": "@primary_measure", "group": "Broadcasting" }
    },
    {
      "taskId": "o2",
      "op": "filter",
      "sentenceIndex": 2,
      "mention": "revenue greater than that average",
      "paramsHint": { "field": "@primary_measure", "operator": ">", "value": "ref:n1" }
    }
  ]
}
```

### 7.2 Step-Compose 출력 예시
```json
{
  "pickTaskId": "o2",
  "op_spec": {
    "op": "filter",
    "field": "@primary_measure",
    "operator": ">",
    "value": "ref:n1"
  },
  "inputs": ["n1"]
}
```

### 7.3 최종 OpsSpec 그래프 예시
```json
{
  "ops": [
    {
      "op": "average",
      "field": "Revenue_Million_Euros",
      "group": "Broadcasting",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ],
  "ops2": [
    {
      "op": "filter",
      "field": "Revenue_Million_Euros",
      "operator": ">",
      "value": "ref:n1",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 }
    }
  ]
}
```

---

## 8) 결정성(Determinism) 확보 전략

1. LLM 호출은 temperature=0  
2. 스키마/계약 기반 strict validation  
3. nodeId stable assignment (`n1, n2, ...`)  
4. grounding/normalization은 결정론적 규칙 기반

이 전략 덕분에 같은 입력은 동일한 OpsSpec을 생성한다.

---

## 9) 확장성(새 연산 추가)

새 연산을 추가할 때의 핵심 원칙:
- 파이프라인 로직은 건드리지 않는다.  
- 연산 계약(필수/선택 필드)과 실행기만 확장한다.  

이렇게 하면 **새 연산이 추가되어도 기존 구조를 유지**할 수 있다.

---

## 10) 연구적 의미

이 파이프라인은 “설명 → 연산 태스크 분해 → 단계별 실행 → 그래프 확정”이라는 구조를 통해  
복잡한 자연어 질의를 안정적으로 그래프 형태로 번역한다.  
각 단계가 명확히 분리되어 있어 **설명 가능성**, **재현성**, **확장성**을 동시에 확보한다.
