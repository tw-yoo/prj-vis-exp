# `bar_simple_ver.json` Linear Player Test Cases

Spec: `data/test/spec/bar_simple_ver.json`  
Data: `data/test/data/bar_simple_ver.csv`

현재 기준에서 NLP linear player는 다음 규칙으로 실행된다.

- `ref` 결과는 `source-backed`, `source-aggregate`, `synthetic-result`로 구분한다.
- `source-backed`, `source-aggregate`만 쓰는 op는 `source-chart`에 남는다.
- `synthetic-result`가 operand로 들어가면 `derived-chart`로 전환한다.
- operand-only aggregate처럼 원본 차트에서 의미가 흐려지는 경우에도 `derived-chart`로 전환한다.
- sentence 안에서 source op가 연속되면, 최종 derived 전환 전까지 annotation을 유지한다.

## Dataset checkpoints

- `USA = 53`
- `JPN = 42`
- `NLD = 76`
- `PRT = 0`
- `max = NLD = 76`
- `avg(all) = 56.45`

## Scope

- 현재 NLP-only linear player의 source/derived 선택 규칙을 검증하기 위한 케이스들이다.
- `filtered-operands-chart`는 이 spec에 `group`/`series` encoding이 없으므로 포함하지 않는다.

## Cases

### 1. Single retrieveValue on source chart

- Goal: 가장 단순한 source 유지 케이스
- Final surface: `source-chart`
- Expected result: 원본 차트 유지 + `USA` highlight/text

```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "target": "USA"
    }
  ]
}
```

### 2. Direct compare on source chart

- Goal: explicit target compare는 derived로 가지 않아야 함
- Final surface: `source-chart`
- Expected result: 원본 차트 유지 + `USA`, `JPN` compare visualization

```json
{
  "ops": [
    {
      "op": "compare",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "targetA": "USA",
      "targetB": "JPN"
    }
  ]
}
```

### 3. Direct diff on source chart

- Goal: explicit target diff는 source-chart에서 실행
- Final surface: `source-chart`
- Expected result: 원본 차트 유지 + `NLD (76) - PRT (0) = 76`

```json
{
  "ops": [
    {
      "op": "diff",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "targetA": "NLD",
      "targetB": "PRT",
      "signed": true
    }
  ]
}
```

### 4. Source-backed ref restoration for diff

- Goal: `ref:n1`, `ref:n2`가 source-backed이면 원본 차트 mark로 복원
- Final surface: `source-chart`
- Expected result:
  - step 1: `USA` 표시
  - step 2: `JPN` 표시
  - step 3: 원본 차트에서 `USA`, `JPN` diff

```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "target": "USA"
    },
    {
      "op": "retrieveValue",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "target": "JPN"
    },
    {
      "op": "diff",
      "id": "n3",
      "meta": { "nodeId": "n3", "inputs": ["n1", "n2"], "sentenceIndex": 1 },
      "field": "rating",
      "targetA": "ref:n1",
      "targetB": "ref:n2",
      "signed": true
    }
  ]
}
```

### 5. Operand-only average after two source retrieves

- Goal: 앞 retrieve들은 source-chart, 마지막 average만 derived-chart
- Final surface: `operand-only-chart`
- Expected result:
  - step 1: `USA` 표시
  - step 2: `JPN` 표시
  - step 3: `USA`, `JPN`만 남은 chart에서 `average = 47.5`

```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "target": "USA"
    },
    {
      "op": "retrieveValue",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "target": "JPN"
    },
    {
      "op": "average",
      "id": "n3",
      "meta": { "nodeId": "n3", "inputs": ["n1", "n2"], "sentenceIndex": 1 },
      "field": "rating"
    }
  ]
}
```

### 6. Source average followed by source scale

- Goal: `average(all)`과 `scale(ref:n1)` 모두 source-chart에서 유지
- Final surface: `source-chart`
- Expected result:
  - step 1: 원본 차트에 `avg(all) = 56.45`
  - step 2: 원본 차트에 `56.45 * 1.1 = 62.10`

```json
{
  "ops": [
    {
      "op": "average",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating"
    },
    {
      "op": "scale",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "target": "ref:n1",
      "factor": 1.1
    }
  ]
}
```

### 7. Source diff with mark and scalar ref

- Goal: source mark + scalar ref도 원본 차트에서 자연스럽게 실행
- Final surface: `source-chart`
- Expected result: `USA (53) - avg(all 56.45) = -3.45`

```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "target": "USA"
    },
    {
      "op": "average",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "field": "rating"
    },
    {
      "op": "diff",
      "id": "n3",
      "meta": { "nodeId": "n3", "inputs": ["n1"], "sentenceIndex": 1 },
      "field": "rating",
      "targetA": "USA",
      "targetB": "ref:n2",
      "signed": true
    }
  ]
}
```

### 8. Cross-sentence reuse from diff to extremum to mixed provenance diff

- Goal: `ref:n4`는 source-backed, `ref:n3`는 synthetic-result로 구분되어야 함
- Expected result:
  - sentence 1 final surface: `source-chart`
  - sentence 2 final surface: `source-chart`
  - sentence 3 final surface: `mixed-operands-chart`

```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "target": "USA"
    },
    {
      "op": "retrieveValue",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "target": "JPN"
    },
    {
      "op": "diff",
      "id": "n3",
      "meta": { "nodeId": "n3", "inputs": ["n1", "n2"], "sentenceIndex": 1 },
      "field": "rating",
      "targetA": "ref:n1",
      "targetB": "ref:n2",
      "signed": true
    }
  ],
  "ops2": [
    {
      "op": "findExtremum",
      "id": "n4",
      "meta": { "nodeId": "n4", "inputs": [], "sentenceIndex": 2 },
      "field": "rating",
      "which": "max"
    }
  ],
  "ops3": [
    {
      "op": "diff",
      "id": "n5",
      "meta": { "nodeId": "n5", "inputs": ["n4"], "sentenceIndex": 3 },
      "field": "rating",
      "targetA": "ref:n4",
      "targetB": "ref:n3",
      "signed": true
    }
  ]
}
```
