<!--
  NOTE:
  - draw 관련 내용은 guide/draw/DRAW_1_BAR_SIMPLE.md 로 분리되어 있음
  - 이 문서는 "data operation(op: retrieveValue/filter/...)" 스펙과 동작을 설명
-->

# `op: "<data operation>"` Guide — Simple Bar

이 문서는 **Simple Bar** 차트에서 사용할 수 있는 **data operation**(예: `retrieveValue`, `filter`, `findExtremum` 등)을 API 문서 형태로 정리합니다.

- draw 액션(`op: "draw"`)은 `guide/draw/DRAW_1_BAR_SIMPLE.md` 참고
- 예시 데이터는 `data/test/spec/bar_simple_ver.json`(country/rating) 기준

---

## 0) 실행 흐름(어디서 실행되나?)
Simple Bar에서 operation 실행은 아래 흐름을 따릅니다.

- `src/renderer/renderChart.ts` → `runChartOps()`
- `src/renderer/bar/simpleBarOps.ts` → `runSimpleBarOps()`
- 계산 함수(공통): `src/logic/dataOps.ts` (각 operation별 함수)
- (일부 op만) 시각화(draw) 추가 수행:
  - **Simple Bar의 `retrieveValue`는 계산 후 자동으로 highlight + text draw를 실행**합니다.
  - 그 외 data operation은 기본적으로 “값 계산/데이터 변형”만 수행하고, 별도 draw는 사용자가 `op:"draw"`로 추가합니다.

---

## 1) Operations 입력 형태
operations payload는 아래 둘 중 하나 형태로 전달됩니다.

### A. 배열 형태
```json
[
  { "op": "retrieveValue", "target": "KOR" },
  { "op": "filter", "field": "rating", "operator": "gte", "value": 60 }
]
```

### B. `{ ops: [...] }` 형태
```json
{
  "ops": [
    { "op": "retrieveValue", "target": "KOR" },
    { "op": "filter", "field": "rating", "operator": "gte", "value": 60 }
  ]
}
```

---

## 2) 공통 규칙(중요)
- operations는 **순서대로 실행**됩니다.
- data operation의 입력 데이터는 “현재까지의 working data” 입니다.
- 일부 operation은 조건이 불충분하면:
  - `[]`를 반환(조용히 실패)하거나
  - `throw Error(...)`로 실패합니다(앱에서 `Run Operations failed`로 표시될 수 있음).
- Simple Bar의 key 매칭은 일반적으로 x축 라벨(예: `"KOR"`)을 사용합니다.

---

## 3) Operation 목록(요약)
| op | 필수 | 선택/기본값 | 결과 타입 | 비고 |
| --- | --- | --- | --- | --- |
| `retrieveValue` | `target` | `field`, `group`, `visual.*` | `DatumValue[]` | **Simple Bar는 자동 draw(하이라이트+텍스트)** |
| `filter` | `operator`, `value` | `field`, `group` | `DatumValue[]` | `operator="between"`은 `value:[start,end]` 필요 |
| `findExtremum` | `which` | `field`, `group` | `DatumValue[]`(길이 0~1) | `which`가 `min`이면 최소, 그 외는 최대 |
| `determineRange` | - | `field`, `group` | `DatumValue[]`(길이 2) | `__min__`, `__max__` 두 datum 반환 |
| `compare` | `targetA`, `targetB` | `field`, `groupA/groupB`, `aggregate`, `which` | `DatumValue[]`(길이 1) | 못 찾으면 throw |
| `compareBool` | `targetA`, `targetB`, `operator` | `field`, `groupA/groupB` | `DatumValue[]`(스칼라 1개) | value는 `1`(true) 또는 `0`(false) |
| `sort` | - | `field`, `order`(`asc`), `group` | `DatumValue[]` | field가 measure면 value 기준 정렬 |
| `count` | - | `group` | `DatumValue[]`(스칼라 1개) | `target="__count__"` |
| `sum` | - | `field`, `group` | `DatumValue[]`(스칼라 1개) | `target="__sum__"` |
| `average` | - | `field`, `group` | `DatumValue[]`(스칼라 1개) | `target="__avg__"` |
| `diff` | `targetA`, `targetB` | `field`, `aggregate`, `signed`, `mode`, `percent`, `scale`, `precision` | `DatumValue[]`(스칼라 1개) | 못 찾으면 throw |
| `lagDiff` | - | `orderField`, `order`, `group`, `absolute` | `DatumValue[]` | 인접 값 차이(시퀀스) |
| `nth` | `n` | `from`(`left`), `group` | `DatumValue[]` | `n`은 1-based |
| `sleep` | `seconds` 또는 `duration` | - | `[]` | 다음 operation 실행까지 지정 시간(초)만큼 대기 |

---

## 4) 상세 스펙 + 예시

### 4.0 sleep
**목표**: 이후 실행될 data/draw operation을 지정한 시간만큼 지연시킵니다.

필수
- `seconds` 또는 `duration` (초 단위; 둘 중 하나 이상 반드시 제공)

예시(2초 대기):
```json
{ "op": "sleep", "seconds": 2 }
```

예시(duration 사용):
```json
{ "op": "sleep", "duration": 0.5 }
```

`sleep`은 모든 chart 차종에 공통으로 적용되며, 다음 operation이 실행되기 전까지 아무런 action을 하지 않습니다.

### 4.1 retrieveValue
**목표**: 특정 x 라벨(`target`)에 해당하는 datum slice를 반환합니다.

필수
- `target`: `"KOR"` 처럼 x축 라벨

선택
- `field`: measure를 명시하려면 `"rating"` 또는 `"value"`
- `visual`(Simple Bar 전용 draw 옵션)
  - `visual.highlightColor` (기본 `#ef4444`)
  - `visual.textColor` (기본 `#111827`)
  - `visual.precision` (텍스트 표시 소수점 자리)

예시(값 선택 + 자동 하이라이트/텍스트)
```json
{
  "op": "retrieveValue",
  "target": "KOR",
  "field": "rating",
  "visual": { "highlightColor": "#f97316", "textColor": "#111827", "precision": 0 }
}
```

### 4.2 filter
**목표**: 조건에 맞는 datum만 남깁니다.

필수
- `operator`: `gt/gte/lt/lte/==/!=/between/...`
- `value`: 비교값

예시(60 이상만)
```json
{ "op": "filter", "field": "rating", "operator": "gte", "value": 60 }
```

예시(between: start/end 필수)
```json
{ "op": "filter", "field": "rating", "operator": "between", "value": [50, 70] }
```

### 4.3 findExtremum
**목표**: 최소/최대 datum 1개를 반환합니다.

필수
- `which`: `"min"` 또는 `"max"`(그 외 값은 max로 처리)

예시(최대 rating)
```json
{ "op": "findExtremum", "field": "rating", "which": "max" }
```

### 4.4 determineRange
**목표**: field의 범위(min/max)를 계산합니다.

예시(rating 범위)
```json
{ "op": "determineRange", "field": "rating" }
```
반환은 아래처럼 2개의 datum입니다.
- `target="__min__"`: 최소값
- `target="__max__"`: 최대값

### 4.5 compare / compareBool
**목표**: 두 target을 비교합니다.

예시(compare: 더 큰 값을 가진 datum 리턴)
```json
{ "op": "compare", "field": "rating", "targetA": "KOR", "targetB": "USA", "which": "max" }
```

예시(compareBool: 불리언 결과)
```json
{ "op": "compareBool", "field": "rating", "targetA": "KOR", "targetB": "USA", "operator": ">" }
```
반환은 `DatumValue[]`(길이 1)이며 `value`가 `1`이면 true, `0`이면 false 입니다.

### 4.6 sort
**목표**: datum을 정렬합니다(기본 asc).

예시(rating 내림차순)
```json
{ "op": "sort", "field": "rating", "order": "desc" }
```

### 4.7 count / sum / average
**목표**: 스칼라 결과를 `DatumValue[]`(길이 1)로 반환합니다.

예시(count)
```json
{ "op": "count" }
```

예시(sum)
```json
{ "op": "sum", "field": "rating" }
```

예시(average)
```json
{ "op": "average", "field": "rating" }
```

### 4.8 diff
**목표**: 두 target의 차이/비율 등을 단일 스칼라 datum으로 반환합니다.

예시(차이: KOR - USA, signed)
```json
{ "op": "diff", "field": "rating", "targetA": "KOR", "targetB": "USA", "signed": true }
```

예시(소수점 제어)
```json
{ "op": "diff", "field": "rating", "targetA": "KOR", "targetB": "USA", "precision": 2 }
```

### 4.9 lagDiff
**목표**: 정렬된 시퀀스에서 인접한 값의 차이를 계산합니다(현재 target 기준).

예시(기본: target 기준 정렬 후 curr - prev)
```json
{ "op": "lagDiff", "field": "rating", "order": "asc" }
```

예시(절댓값)
```json
{ "op": "lagDiff", "field": "rating", "absolute": true }
```

### 4.10 nth
**목표**: 현재 순서에서 n번째 datum을 반환합니다(`n`은 1부터).

예시(왼쪽에서 1번째)
```json
{ "op": "nth", "n": 1, "from": "left" }
```

예시(오른쪽에서 2번째)
```json
{ "op": "nth", "n": 2, "from": "right" }
```

---

## 5) 자주 하는 실수
- `retrieveValue`에서 `target`을 x라벨과 다르게 쓰는 경우(예: `"Korea"` vs `"KOR"`)
- `filter`에서 `between`인데 `value`를 `[start,end]`로 안 주는 경우(에러 발생)
- `compare/diff`에서 `targetA/targetB`가 현재 working data에 존재하지 않는 경우(에러 발생)

---

## 6) (고급) 이전 결과(runtime) 참조
Simple Bar ops runner는 실행 시작 시 runtime cache를 초기화하고(`resetRuntimeResults`), 각 step 결과(배열 형태 datum)를 내부 key로 저장합니다.

- 저장 key는 기본적으로 `${op.op}_${index}` 입니다(0-based index).
- 사용자는 operation에 `id`(또는 `key`)를 추가해서 key를 바꿀 수 있습니다(타입에는 없지만 런타임에서는 동작).
- 이후 operation에서 `target: "<저장key>"` 형태로 참조되면, 현재 데이터에서 못 찾는 경우 runtime cache를 조회합니다.

이 기능은 내부 동작 확인/디버깅 목적의 고급 기능이며, 필요 시 별도 예시를 추가하는 것을 권장합니다.
