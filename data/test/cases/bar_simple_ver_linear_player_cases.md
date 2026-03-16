# `bar_simple_ver.json` Linear Player Test Cases

Spec: `data/test/spec/bar_simple_ver.json`  
Data: `data/test/data/bar_simple_ver.csv`

This list is ordered from easy source-chart execution to more complex derived-chart execution.

## Dataset checkpoints

- `USA = 53`
- `JPN = 42`
- `NLD = 76`
- `PRT = 0`
- `max = NLD = 76`
- `avg(all) = 56.45`

## Scope

- Good for testing the current NLP-only linear player.
- Good for checking sentence-level navigation and result-only reuse.
- `filtered-operands-chart` is not included here because this spec has no `group` or `series` encoding.

## Cases

### 1. Single retrieveValue on source chart

- Goal: simplest source-chart execution
- Final surface: `source-chart`
- Expected result: `USA = 53`
- Paste into `JSON Ops`:

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

- Goal: compare without derived surface
- Final surface: `source-chart`
- Expected result: `USA (53)` beats `JPN (42)`

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

- Goal: diff without derived surface
- Final surface: `source-chart`
- Expected result: `NLD (76) - PRT (0) = 76`

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

### 4. Two retrieveValue nodes feeding a diff

- Goal: `two-value-chart`
- Final surface: `derived-chart`
- Expected result: `53 - 42 = 11`

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
      "signed": true
    }
  ]
}
```

### 5. Two chart-backed values feeding average

- Goal: `operand-only-chart`
- Final surface: `derived-chart`
- Expected result: `average(53, 42) = 47.5`

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

### 6. Average feeding scale

- Goal: `scalar-reference-chart`
- Final surface: `derived-chart`
- Expected result: `56.45 * 1.1 = 62.095`

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

### 7. Chart-backed value versus scalar average

- Goal: `mixed-operands-chart`
- Final surface: `derived-chart`
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

### 8. Cross-sentence reuse from diff to extremum to mixed diff

- Goal: sentence navigation plus result-only reuse
- Sentence 1 expected: `11`
- Sentence 2 expected: `NLD = 76`
- Sentence 3 expected: `76 - 11 = 65`

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
      "targetA": "NLD",
      "targetB": "ref:n3",
      "signed": true
    }
  ]
}
```

### 9. Cross-sentence scalar reuse with add

- Goal: derived surface chaining with scalar-only reuse
- Sentence 1 expected: `average(USA, JPN) = 47.5`, `diff(USA, JPN) = 11`
- Sentence 2 expected: `47.5 + 11 = 58.5`

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
    },
    {
      "op": "diff",
      "id": "n4",
      "meta": { "nodeId": "n4", "inputs": ["n1", "n2"], "sentenceIndex": 1 },
      "field": "rating",
      "signed": true
    }
  ],
  "ops2": [
    {
      "op": "add",
      "id": "n5",
      "meta": { "nodeId": "n5", "inputs": [], "sentenceIndex": 2 },
      "field": "rating",
      "targetA": "ref:n3",
      "targetB": "ref:n4"
    }
  ]
}
```
