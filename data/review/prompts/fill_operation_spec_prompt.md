# Task: review_cases_new.csv 240개의 operation_spec 생성

당신은 이 repo의 chart-QA 연구에서 자연어 explanation을 operation_spec(JSON DAG)으로 변환하는 작업을 수행합니다. 이 프롬프트는 cold-start로 받아 self-contained하게 실행 가능하도록 작성됐습니다.

---

## 0) 입력 / 출력

### Input file
- `/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/data/review/review_cases_new.csv`
- 240 rows, 컬럼: `chart_type, chart_id, question, explanation`
- 모든 row의 operation_spec은 현재 비어있음 → 이 작업이 채움.

### chart_type 분포 (각 48개씩)
- `bar_simple`, `bar_grouped`, `bar_stacked`, `line_simple`, `line_multiple`

### chart_id → Vega-Lite spec & CSV data 매핑

```
chart_type        spec path                                          data path
----------------  -------------------------------------------------  -------------------------------------------------
bar_simple        ChartQA/data/vlSpec/bar/simple/<chart_id>.json     ChartQA/data/csv/bar/simple/<chart_id>.csv
bar_grouped       ChartQA/data/vlSpec/bar/grouped/<chart_id>.json    ChartQA/data/csv/bar/grouped/<chart_id>.csv
bar_stacked       ChartQA/data/vlSpec/bar/stacked/<chart_id>.json    ChartQA/data/csv/bar/stacked/<chart_id>.csv
line_simple       ChartQA/data/vlSpec/line/simple/<chart_id>.json    ChartQA/data/csv/line/simple/<chart_id>.csv
line_multiple     ChartQA/data/vlSpec/line/multiple/<chart_id>.json  ChartQA/data/csv/line/multiple/<chart_id>.csv
```

모든 경로는 repo root (`/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/`) 기준 상대 경로.

### Output file
- `/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/data/review/review_cases_new_filled.csv`
- 컬럼: `chart_id, chart_type, status, question, explanation, operation_spec, feedback, updated_at` (8 컬럼; review page 호환 형식)
  - `status` = `"pending"` (기본값)
  - `feedback` = `""` (빈 문자열)
  - `updated_at` = `""` (빈 문자열)
- **중요**: 작업 도중 context limit에 도달해도 잃지 않도록 **매 batch마다 incremental save**. 새 batch 시작 전에 이미 처리된 row가 있으면 skip하고 누락된 row만 채울 것.

---

## 1) Operation spec 카탈로그 (18종)

각 op의 spec 정의 + 의미. JSON 예시는 §3 / §4 참조.

### 1.1 Data 선택 / 변환

#### `retrieveValue`
- **의미**: 특정 x 라벨에 매칭되는 y값을 반환 (forward), 또는 특정 y값에 매칭되는 x를 반환 (reverse).
- **필수**: `target` (x 라벨 또는 numeric y값).
- **선택**: `field`, `group`, `targetAxis: 'x'|'y'` (default `'x'`).
- **사용**: "the value of 2010", "어느 해에 60을 기록했나".

#### `filter`
- **의미**: 조건에 맞는 row만 남김.
- **필수**: 다음 중 하나 모드:
  - membership: `include: [...]` 또는 `exclude: [...]`
  - comparison: `operator` (`>`, `>=`, `<`, `<=`, `==`, `!=`, `between`, `in`, `not-in`) + `value`
  - group-only: `group` (단일 string 또는 list)
- **선택**: `field`, `xKindHint` (`temporal`/`quantitative`/`ordinal`/`nominal`).
- **`between` 모드**: `value: [start, end]` 형태로 inclusive row-order slice.
- **사용**: "from 2010 to 2015", "values above 50", "for the Asia series", "between 2008 and 2011".

#### `sort`
- **의미**: 정렬 (asc/desc).
- **선택**: `field`, `order` (`asc`/`desc`), `orderField`, `group`.
- **사용**: "ranked from highest to lowest", "sorted by year". 보통 후속 `nth` / `findExtremum`과 chain.

### 1.2 Aggregate (scalar 반환)

#### `sum`
- **필수**: `field`. **선택**: `group` (string or list).
- **bar chart 전용**. line chart에서는 사용 금지.
- **사용**: "total of 2010-2015", "sum across all categories". 합산할 범위는 prior filter로 좁힘.

#### `average`
- **필수**: `field`. **선택**: `group`.
- **사용**: "average across years", "mean revenue". prior filter로 범위 좁힘.

#### `count`
- **선택**: `field`, `group`.
- **사용**: "how many years above threshold", "number of items". 보통 `filter → count` chain.

#### `range`
- **선택**: `field`, `group`.
- **결과**: 단일 scalar (max − min).
- **사용**: "spread", "variation", "max minus min". `findExtremum(max)+findExtremum(min)+diff` chain의 대체.

### 1.3 Diff / Comparison

#### `diff`
- **필수**: `targetA`, `targetB` (scalar ref `"ref:nX"` 또는 dimension label).
- **선택**: `field`, `signed` (default true), `mode` (`"ratio"`), `percent` (true → percentage change), `aggregate` (`sum`/`avg`/`min`/`max`/`percentage_of_total`), `groupA`/`groupB`, `precision`, `scale`.
- **사용**: 두 scalar의 차이. "difference between X and Y", "% change", "ratio of A to B".

#### `lagDiff`
- **선택**: `field`, `orderField`, `order`, `group`, `absolute`.
- **결과**: row list (인접 step 차이).
- **사용**: "year-over-year change", "month-over-month difference", "consecutive change".

#### `pairDiff`
- **필수**: `groupA`, `groupB`. **권장**: `by` (key field), `field`.
- **선택**: `seriesField`, `signed`, `absolute`, `precision`, `group`.
- **결과**: row list (key별 두 series의 차이).
- **chart 제약**: series가 있는 chart만 (`multipleLine`, `groupedBar`, `stackedBar`). simple bar/line에서 사용 금지.
- **사용**: "for each year, gap between A and B".

#### `diffByValue`
- **필수(둘 중 하나만)**: `value` (numeric literal) 또는 `targetValue` (`"ref:nX"`).
- **선택**: `field`, `group`, `signed` (default true).
- **결과**: row list (각 row의 V와의 차이).
- **사용**: "each year's deviation from the average", "distance from baseline V". `diff`(두 scalar)와 다름: 모든 row 대비 한 reference.

#### `compareBool`
- **필수**: `operator` (`>`, `<`, `==`, `>=`, `<=`, `!=`).
- **선택**: `targetA`, `targetB` (scalar refs), `field`, `groupA`, `groupB`, `aggregate`.
- **결과**: 단일 scalar (0 또는 1).
- **Terminal op**: yes/no 질문 답에 자주 사용. 보통 chain 마지막.
- **사용**: "is A greater than B", "did X exceed Y".

### 1.4 Selection / Ranking

#### `findExtremum`
- **필수**: `which: 'max'|'min'`. **선택**: `field`, `group`, `rank` (1-based; 2 = 2nd extreme).
- **사용**: "highest", "lowest", "second largest", "최대값".

#### `nth`
- **필수**: `n` (integer or list of integers, 1-based).
- **선택**: `field`, `group`, `from: 'left'|'right'` (default `'left'`), `orderField`, `order`.
- **결과**: n번째 row (정렬 후의 left/right 기준).
- **사용**: "second lowest" → sort(asc) + nth(n=2, from='left'). 또는 단독 `nth`(orderField + from).

### 1.5 Scalar arithmetic

#### `add`
- **필수**: `targetA`, `targetB` (scalar refs `"ref:nX"` 또는 numeric literal).
- **선택**: `field`, `group`.
- **결과**: 단일 scalar (= A + B).
- **사용**: "Germany + Italy", pointwise 두 값 합. `sum`(범위 합)과 다름.

#### `scale`
- **필수**: `target` (scalar ref 또는 literal), `factor` (numeric).
- **선택**: `field`, `group`.
- **결과**: 단일 scalar (= target × factor).
- **사용**: "×2 (doubled)", "÷2 (half)", "convert to percentage (×100)". "(a+b)/2 midpoint" 패턴은 `add(a,b)` → `scale(target=ref:n_add, factor=0.5)`.

### 1.6 Pattern detection

#### `rollingWindow`
- **필수**: `window` (양의 정수).
- **선택**: `aggregate` (`sum`/`avg`/`min`/`max`, default `avg`), `field`, `group`, `orderField`.
- **결과**: row list ((N − window + 1)개 windows).
- **사용**: "3-year moving average", "consecutive N-year window". 후속 `findExtremum`/`nth`로 best window 선택.

#### `monotonicRun`
- **선택**: `direction` (`'increasing'`/`'decreasing'`, default `'increasing'`), `mode` (`'longest'`/`'firstBreak'`/`'all'`, default `'longest'`), `strict` (default true), `minLength` (default 2), `field`, `group`, `orderField`.
- **결과**: mode별:
  - `longest`: 가장 긴 단조 구간의 row list
  - `firstBreak`: 첫 단조 시작 시점의 단일 row
  - `all`: 모든 적격 run flatten
- **사용**: "longest period of decrease", "year when X starts to decrease", "all runs of N+ consecutive declines".

### 1.7 setOp은 제거됨 — 사용 금지

set 교집합/합집합은 **연속 filter chain**으로 대체:
- 같은 row가 두 조건 모두 만족 (AND/intersection) → filter1 → filter2 (working data 누적으로 자동 AND)
- 같은 field에서 A or B (OR/union) → 단일 filter with `include: [A, B]`

---

## 2) Operation spec JSON 구조

### 전체 형식

```json
{
  "ops":  [<op1>, <op2>, ...],
  "ops2": [<op1>, <op2>, ...],
  "ops3": [...]
}
```

- `opsN` = chunk(N) 안의 ops. explanation이 "1. ... 2. ... 3. ..." 같이 명확한 단계로 나뉘면 N개 그룹.
- 단계 구분 없으면 모두 `ops`에 넣음.
- group key는 반드시 `"ops"`, `"ops2"`, `"ops3"`, ... 순서.

### 각 op 객체 구조

```json
{
  "op": "<op_name>",
  "id": "n<digits>",
  "meta": {
    "nodeId": "n<digits>",
    "inputs": ["n<prev1>", "n<prev2>"],
    "sentenceIndex": <1-based chunk index>
  },
  "<op-specific field>": "...",
  "...": "..."
}
```

규칙:
- `id` ≡ `meta.nodeId` (같은 값)
- `id` 는 전체 ops에서 unique: `n1`, `n2`, `n3`, ...
- `meta.inputs` = 이 op이 결과를 consume하는 prior nodeId들. 없으면 `[]`.
- `meta.sentenceIndex` = 이 op이 속한 chunk의 1-based index.
- scalar reference 형태로 prior result를 사용할 땐 `"ref:nX"` string (예: `"targetA": "ref:n1"`).
- ⚠ `{"id": "n1"}` 같은 object reference는 사용 금지.

### 예시 1: 단일 chunk (모두 ops에)

Q: "Which year had the largest jump in audience?"
Exp: "Compare year-to-year audience changes. The largest jump is at year X."

```json
{
  "ops": [
    {
      "op": "lagDiff",
      "id": "n1",
      "meta": {"nodeId": "n1", "inputs": [], "sentenceIndex": 1},
      "field": "Audience_Millions",
      "orderField": "Year"
    },
    {
      "op": "findExtremum",
      "id": "n2",
      "meta": {"nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2},
      "which": "max",
      "field": "Audience_Millions"
    }
  ]
}
```

(chunk 1 = lagDiff "compare year-to-year changes", chunk 2 = findExtremum "largest". 같은 ops에 넣은 것은 chunk 구분이 explanation에 명시 안 됐다고 판단했을 때만.)

### 예시 2: 다중 chunk

Q: "How many years are above the average?"
Exp: "1. Compute the average. 2. Filter years where value > average. 3. Count."

```json
{
  "ops": [
    {
      "op": "average",
      "id": "n1",
      "meta": {"nodeId": "n1", "inputs": [], "sentenceIndex": 1},
      "field": "value"
    }
  ],
  "ops2": [
    {
      "op": "filter",
      "id": "n2",
      "meta": {"nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2},
      "field": "value",
      "operator": ">",
      "value": "ref:n1"
    }
  ],
  "ops3": [
    {
      "op": "count",
      "id": "n3",
      "meta": {"nodeId": "n3", "inputs": ["n2"], "sentenceIndex": 3}
    }
  ]
}
```

---

## 3) Explanation 키워드 → op 매핑 (선택 가이드)

inventory phrasing이 직관과 다를 수 있으므로 매핑 참조:

| Explanation 표현 | 권장 op |
|---|---|
| "compute the average / mean" | `average` |
| "sum / add up / total" (범위 합산) | `sum` (bar only) |
| "how many / number of / count" | `filter → count` |
| "highest / largest / max" | `findExtremum(max)` |
| "lowest / smallest / min" | `findExtremum(min)` |
| "second highest / N-th largest" | `sort(desc) → nth(n=N, from='left')` 또는 `findExtremum(rank=N)` |
| "spread / variation / max − min" | `range` |
| "for each year, gap between A and B" | `pairDiff` (multi-series only) |
| "year-over-year / month-over-month change" | `lagDiff` |
| "Germany + Italy" (pointwise 두 값 합) | `add` |
| "doubled / halved / ×N / midpoint = (a+b)/2" | `scale` (midpoint은 `add` → `scale(0.5)`) |
| "deviation from average / distance from V" | `diffByValue` |
| "is A greater than B / yes-no terminal" | `compareBool` |
| "3-year average / N-year window / moving avg" | `rollingWindow` |
| "longest period of decrease" | `monotonicRun(direction=decreasing, mode=longest)` |
| "year when X starts to decrease" | `monotonicRun(direction=decreasing, mode=firstBreak)` |
| "all runs of ≥ N consecutive increases" | `monotonicRun(mode=all, minLength=N)` |
| "share of / percent of total / X's fraction of total" | `diff(aggregate='percentage_of_total')` |
| "ratio of A to B / X times Y / X-fold" | `diff(mode='ratio')` |
| "% change / increased by N%" | `diff(percent=true)` |
| "from year A to year B" | `filter(operator='between', value=[A,B])` |
| "both A and B (same row)" | filter chain (filter1 → filter2 자동 AND) |
| "A or B (same field)" | 단일 `filter(include=[A,B])` |
| "first 3 / leftmost 3 / 가장 최근 3" | `nth(n=[1,2,3], from='left'/'right')` |

---

## 4) 차트 타입별 op 호환성

이 표에 없는 op은 해당 chart에서 사용 금지:

| Op | bar_simple | bar_grouped | bar_stacked | line_simple | line_multiple |
|---|:--:|:--:|:--:|:--:|:--:|
| retrieveValue, filter, average, diff, count, range, scale, add, compareBool, diffByValue, rollingWindow, monotonicRun, sort, nth, findExtremum | ✓ | ✓ | ✓ | ✓ | ✓ |
| lagDiff | — | — | — | ✓ | ✓ |
| pairDiff | — | ✓ | ✓ | — | ✓ |
| sum | ✓ | ✓ | ✓ | — | — |

특기:
- `sum`은 bar만. line에서는 `average` 또는 다른 aggregate 사용.
- `pairDiff`는 series가 있는 chart만 (simple은 series가 없음).
- `lagDiff`는 보통 line chart의 시간축 패턴.
- multi-series chart (`line_multiple`, `bar_grouped`, `bar_stacked`)에서 단일 series 작업 시 `group` 명시.

---

## 5) 작업 절차 (batch processing)

### 5.1 사전 점검 (한 번만)

작업 시작 시:
1. **input CSV 읽기**: `data/review/review_cases_new.csv` (240 rows).
2. **output CSV 존재 확인**: `data/review/review_cases_new_filled.csv`이 있는지 확인.
   - 있으면 이미 처리된 chart_id 집합 추출 → skip
   - 없으면 새 파일 생성 (헤더 작성).
3. **남은 작업량 확인**: 240 − processed = remaining.

### 5.2 Batch 처리

**Batch size**: 한 번에 **10~15 케이스** 처리 권장 (context 부담 균형).

각 batch마다:
1. **batch 범위 결정**: input CSV에서 아직 처리 안 된 다음 10~15개 row 선택.
2. **각 row 처리**:
   1. `chart_type`, `chart_id`, `question`, `explanation` 읽음.
   2. spec 파일 읽음: `ChartQA/data/vlSpec/{type1}/{type2}/{chart_id}.json` (§0 매핑표).
      - `encoding.x.field` (x축 field 이름), `encoding.y.field` (y축 measure field), `encoding.color.field` (series field) 추출.
   3. data CSV 읽음: `ChartQA/data/csv/{type1}/{type2}/{chart_id}.csv`.
      - 첫 5~10 row만 preview해도 충분 (대부분 chart는 50 row 이하).
      - column name과 categorical/numeric 도메인 파악.
   4. **operation_spec 생성**:
      - explanation을 chunk로 분할 (보통 "1.", "2." 또는 sentence 단위).
      - 각 chunk에서 op task 추출 (§3 매핑 참조).
      - 각 task를 JSON op로 변환 (§1 카탈로그 + §2 형식 + §4 호환성).
      - `meta.inputs` 정확히 설정 (이전 op이 chain에 input으로 들어가야 함).
      - `meta.sentenceIndex` = chunk index.
      - scalar ref가 필요한 곳은 `"ref:nN"` string 사용.
3. **batch 저장**: output CSV에 batch row들 append (incremental save).
4. **다음 batch로 진행**: 1로 돌아감.

### 5.3 추천 batch 분할

240 / 15 = **16 batches**. chart_type별로 정렬해서 처리하면 같은 chart 패턴이 묶여 효율적:

- Batch 1-3: `bar_simple` (48)
- Batch 4-6: `bar_grouped` (48)
- Batch 7-9: `bar_stacked` (48)
- Batch 10-12: `line_simple` (48)
- Batch 13-15: `line_multiple` (48)
- Batch 16: cleanup / 잔여 처리

또는 chart_type 섞어서 처리해도 무방.

### 5.4 Incremental save 패턴

각 batch 끝나면 다음을 수행 (Python으로 작성하는 게 가장 안전):

```python
import csv, json, os
INPUT = "data/review/review_cases_new.csv"
OUTPUT = "data/review/review_cases_new_filled.csv"
HEADERS = ["chart_id", "chart_type", "status", "question", "explanation",
           "operation_spec", "feedback", "updated_at"]

# Step 1: load input
with open(INPUT) as f:
    input_rows = list(csv.DictReader(f))

# Step 2: check what's already done
done_ids = set()
if os.path.exists(OUTPUT):
    with open(OUTPUT) as f:
        for r in csv.DictReader(f):
            if r.get("chart_id") and r.get("operation_spec", "").strip():
                done_ids.add(r["chart_id"])

# Step 3: process this batch (e.g., 15 cases at a time)
todo = [r for r in input_rows if r["chart_id"] not in done_ids][:15]

# (analyze each row → produce ops_spec dict → json.dumps)
# ... build new_rows list with full 8-column dicts ...

# Step 4: append to output
file_exists = os.path.exists(OUTPUT)
with open(OUTPUT, "a", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=HEADERS, quoting=csv.QUOTE_ALL)
    if not file_exists:
        writer.writeheader()
    for new_row in new_rows:
        writer.writerow(new_row)
```

**중요**: 매 batch마다 위 패턴으로 저장. context limit 도달해도 직전 batch까지의 결과가 보존됨.

---

## 6) 품질 기준

각 row의 operation_spec은 다음을 만족해야 함:

### 6.1 JSON 유효성
- `json.loads()`로 parse 가능.
- 모든 op이 §1의 catalog에 있음 (오타 / 신조어 금지).
- 모든 op의 필수 field 충족.

### 6.2 Chain 무결성
- 각 op의 `meta.inputs`에 있는 nodeId가 chain 앞부분에 정의된 op의 id와 일치.
- `"ref:nN"` 참조 시 `nN`이 chain에 존재.
- 마지막 op이 question의 final answer를 produce하는 type (scalar / list / boolean).

### 6.3 차트 호환성 (§4)
- `sum`은 line chart에서 사용하지 않음.
- `pairDiff`는 single-series chart (simple bar/line)에서 사용하지 않음.
- `lagDiff`는 bar chart에서는 자제 (대부분 line의 시간 패턴).

### 6.4 Chain 길이 (간결성)
- 동일 의미를 표현하는 가장 짧은 chain 선호:
  - `findExtremum(max) + findExtremum(min) + diff` 대신 `range`
  - `filter → average × 여러 윈도우` 대신 `rollingWindow`
  - `lagDiff → filter → count` 같은 단조 패턴 분석 대신 `monotonicRun`
  - `retrieveValue × N + add chain` 대신 `filter → sum`
- 평균 op 수 목표: 1~5 ops per case (단순 질문 1-2, 복잡 질문 5-7).

### 6.5 sentenceIndex 의미
- chunk index는 explanation의 명시적 단계 ("1.", "2.")에 매칭.
- 명시 단계가 없으면 모두 sentenceIndex=1.
- sentenceIndex 값이 chunk 순서를 의미하므로 1부터 시작하고 건너뛰지 않음 (1, 2, 3, ...).

### 6.6 Empty operation_spec 허용 케이스
다음 4가지는 빈 string `""`으로 유지:
- explanation이 chart 데이터와 mismatch (예: 존재하지 않는 column 언급)
- chart_id가 비어있음 / spec 파일 없음
- explanation이 "데이터로 계산 불가" 명시
- 너무 모호해서 어떤 op도 매칭할 수 없음

---

## 7) 자주 하는 실수 (방지)

### 7.1 op 이름 오타
- `compareBool` ≠ `compare_bool` / `CompareBool`
- `pairDiff` ≠ `pair_diff` / `PairDiff`
- `rollingWindow` ≠ `rolling_window`
- `monotonicRun` ≠ `monotonic_run`
- camelCase 일관성 유지.

### 7.2 ref 형식
- 사용 가능: `"ref:n1"`, `"ref:n2"` (string)
- 사용 금지: `{"id": "n1"}` (object), `"@n1"`, `"$n1"` 등

### 7.3 inputs 누락
- `diff(targetA=ref:n1, targetB=ref:n2)` → `meta.inputs`에 **둘 다** 포함: `["n1", "n2"]`
- `filter(value=ref:n1)` → `meta.inputs`에 `["n1"]`
- `compareBool(targetA=ref:n1, targetB=ref:n2)` → `["n1", "n2"]`

### 7.4 series field에 filter 금지
- 잘못: `{"op": "filter", "field": "<series_field>", "include": ["A","B"]}`
- 옳음: 후속 op에 `"group": "A"` / `"groupA": "A", "groupB": "B"`로 series 제한.
- 단, FilterOp의 `group: ["A","B"]` (list = OR semantics)는 허용.

### 7.5 sum vs add 혼동
- `sum`: 여러 row의 값 합산 (column 단위 aggregation). bar chart only.
- `add`: 두 scalar의 산술 덧셈. 모든 chart.
- "Germany + Italy 합" → `add(retrieveValue(Germany), retrieveValue(Italy))` 또는 `filter(include=[Germany,Italy]) → sum`.

### 7.6 chunk 과잉 분할
- explanation에 "1. ... 2. ..." 같이 **명시적 단계**가 있을 때만 `ops`/`ops2`/`ops3` 분할.
- 한 문장 안의 여러 동사를 chunk로 쪼개지 않음.

### 7.7 setOp 사용 금지
- 18개 allowed op에 setOp 없음.
- 같은 row가 두 조건 모두 만족 → 연속 filter chain (자동 AND).

### 7.8 between 모드 value 형식
- `{"op": "filter", "operator": "between", "value": [start, end]}` — value는 길이 2 list.
- `value: start` 또는 `value: {min, max}` 형태는 잘못.

### 7.9 nth의 from 의미
- `from: 'left'` = 정렬된 array의 처음부터 n번째 (asc면 작은 값부터).
- `from: 'right'` = 정렬된 array의 끝부터 n번째 (asc면 큰 값부터, "가장 최근 N" 의미).

### 7.10 rollingWindow의 window=N 의미
- "3-year moving average" → window=3.
- "last 5 years"는 rollingWindow가 아니라 `filter` (단순 범위).
- `aggregate`: "moving average" → `'avg'`, "running total" → `'sum'`.

---

## 8) 작업 시작 시 자기 체크리스트

작업 시작 전에:
- [ ] §0 입력/출력 경로 확인
- [ ] §1 18개 op 카탈로그 숙지
- [ ] §2 JSON 구조 (id, meta, ref) 숙지
- [ ] §3 explanation 매핑 표 숙지
- [ ] §4 chart × op 호환성 표 숙지
- [ ] §5 batch processing 패턴 이해
- [ ] §6 품질 기준 (Chain 길이, JSON 유효성) 이해
- [ ] §7 자주 하는 실수 숙지

각 batch 시작 시:
- [ ] 이미 처리된 chart_id 집합 갱신
- [ ] 다음 10~15개 row 선택 (chart_type 정렬 권장)

각 case 처리 시:
- [ ] chart_type → spec/csv 경로 매핑 (§0)
- [ ] explanation chunk 분할 + 매핑 (§3)
- [ ] chart 호환성 확인 (§4)
- [ ] op chain 작성 + ref/inputs 일관성 (§2)
- [ ] JSON 유효성 self-check (§6.1)

각 batch 끝:
- [ ] CSV에 incremental save (§5.4)
- [ ] 진행 상황 로그 (예: "Processed 30/240")

---

## 9) 추가 참조 (필요시 직접 읽기)

본 prompt에 모든 핵심 정보가 있지만, 더 자세한 사양이 필요하면:

- `nlp_server/docs/operations_full_json_examples.md` — 각 op의 JSON 예시 + 사용 사례
- `nlp_server/prompts/opsspec_inventory.md` — explanation → op task 매핑 룰 (full)
- `nlp_server/prompts/opsspec_step_compose.md` — task → op spec 변환 룰 (full)
- `nlp_server/prompts/opsspec_shared_rules.md` — 14개 공통 룰
- `docs/operation-spec-by-chart.md` — chart × op 매트릭스 + chart-specific 동작
- `nlp_server/opsspec/runtime/op_registry.py` — BE op contract (semantic_rules)
- `data/review/review_cases_updated.csv` — 이전 200 케이스의 reference (sample chain pattern)

---

## 10) 최종 검증 (240 모두 완료 후)

작업 끝나면 다음을 보고:

1. 총 row 수: 240 / 240
2. 각 row 처리 분류:
   - operation_spec 채워진 row: N
   - 빈 string으로 유지된 row: M (§6.6의 이유로)
   - 합계: N + M = 240
3. **JSON 유효성**: 모든 채워진 row의 spec이 `json.loads()` 통과.
4. **Chain 무결성**: 모든 `meta.inputs` 참조가 chain 내부에서 해결됨.
5. **Chart 호환성**: §4 표에 부합.
6. **op 사용 빈도 tally**: 18 op 각각 몇 번 사용됐는지. (`range`/`rollingWindow`/`monotonicRun` 같은 신규 op도 적절한 케이스에 사용됐는지 spot-check.)
7. **샘플 spot-check** (각 chart_type별 1개씩 = 5개) 출력해서 사용자가 검토 가능하게.

---

## 끝 — 시작하세요

`data/review/review_cases_new.csv`를 읽고, batch로 240개 케이스를 처리하여 `data/review/review_cases_new_filled.csv`에 채워주세요. 매 batch마다 incremental save 필수.

진행 상황을 batch별로 짧게 보고하고, 마지막에 §10의 최종 검증 결과를 보여주세요.
