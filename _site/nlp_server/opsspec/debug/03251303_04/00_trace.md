# Recursive Grammar Trace

## Inventory (S(O))
- total_tasks: 2

| taskId | op | sentenceIndex | mention | paramsHint |
| --- | --- | --- | --- | --- |
| o1 | filter | 1 | get the all values from the agriculture sector | `{"group": "Agriculture"}` |
| o2 | findExtremum | 2 | find the maximum value | `{"field": "Share_of_GDP", "which": "max"}` |

## Steps

### Step 1
- taskId: o1
- nodeId: n1
- op: filter
- groupName: ops
- inputs: []
- scalarRefs: []

#### Inventory delta
- remaining_before_count: 2
- remaining_after_count: 1
- remaining_before: ['o1', 'o2']
- remaining_after: ['o2']

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: filter"]
```

### Step 2
- taskId: o2
- nodeId: n2
- op: findExtremum
- groupName: ops2
- inputs: ['n1']
- scalarRefs: []

#### Inventory delta
- remaining_before_count: 1
- remaining_after_count: 0
- remaining_before: ['o2']
- remaining_after: []

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: filter"]
  n2["n2: findExtremum"]
  n1 --> n2
```

