# Recursive Grammar Trace

## Inventory (S(O))
- total_tasks: 3

| taskId | op | sentenceIndex | mention | paramsHint |
| --- | --- | --- | --- | --- |
| o1 | average | 1 | Find average | `{"field": "Production in million units"}` |
| o2 | filter | 2 | filter which countries are above the average | `{"field": "Production in million units", "operator": ">", "value": "ref:n1"}` |
| o3 | count | 2 | filter which countries are above the average | `{}` |

## Steps

### Step 1
- taskId: o1
- nodeId: n1
- op: average
- groupName: ops
- inputs: []
- scalarRefs: []

#### Inventory delta
- remaining_before_count: 3
- remaining_after_count: 2
- remaining_before: ['o1', 'o2', 'o3']
- remaining_after: ['o2', 'o3']

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: average"]
```

### Step 2
- taskId: o2
- nodeId: n2
- op: filter
- groupName: ops2
- inputs: ['n1']
- scalarRefs: ['n1']

#### Inventory delta
- remaining_before_count: 2
- remaining_after_count: 1
- remaining_before: ['o2', 'o3']
- remaining_after: ['o3']

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: average"]
  n2["n2: filter"]
  n1 --> n2
```

### Step 3
- taskId: o3
- nodeId: n3
- op: count
- groupName: ops2
- inputs: ['n2']
- scalarRefs: []

#### Inventory delta
- remaining_before_count: 1
- remaining_after_count: 0
- remaining_before: ['o3']
- remaining_after: []

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: average"]
  n2["n2: filter"]
  n3["n3: count"]
  n1 --> n2
  n2 --> n3
```

