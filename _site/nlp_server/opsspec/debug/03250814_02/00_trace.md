# Recursive Grammar Trace

## Inventory (S(O))
- total_tasks: 4

| taskId | op | sentenceIndex | mention | paramsHint |
| --- | --- | --- | --- | --- |
| o1 | findExtremum | 1 | Check Scotland's Biggest Value | `{"field": "SharePercentage", "group": "Scotland", "which": "max"}` |
| o2 | findExtremum | 2 | Check the smallest value for England & Wales | `{"field": "SharePercentage", "group": "England & Wales", "which": "min"}` |
| o3 | compare | 3 | Check if the value is greater than the value of number 1 or number 2 | `{"targetA": "ref:n1", "targetB": "ref:n2", "which": "max"}` |
| o4 | diff | 4 | Subtract small value from large value | `{"field": "SharePercentage", "targetA": "ref:n2", "targetB": "ref:n1", "signed": false}` |

## Steps

### Step 1
- taskId: o1
- nodeId: n1
- op: findExtremum
- groupName: ops
- inputs: []
- scalarRefs: []

#### Inventory delta
- remaining_before_count: 4
- remaining_after_count: 3
- remaining_before: ['o1', 'o2', 'o3', 'o4']
- remaining_after: ['o2', 'o3', 'o4']

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: findExtremum"]
```

### Step 2
- taskId: o2
- nodeId: n2
- op: findExtremum
- groupName: ops2
- inputs: []
- scalarRefs: []

#### Inventory delta
- remaining_before_count: 3
- remaining_after_count: 2
- remaining_before: ['o2', 'o3', 'o4']
- remaining_after: ['o3', 'o4']

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: findExtremum"]
  n2["n2: findExtremum"]
```

### Step 3
- taskId: o3
- nodeId: n3
- op: compare
- groupName: ops3
- inputs: ['n1', 'n2']
- scalarRefs: ['n1', 'n2']

#### Inventory delta
- remaining_before_count: 2
- remaining_after_count: 1
- remaining_before: ['o3', 'o4']
- remaining_after: ['o4']

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: findExtremum"]
  n2["n2: findExtremum"]
  n3["n3: compare"]
  n1 --> n3
  n2 --> n3
```

### Step 4
- taskId: o4
- nodeId: n4
- op: diff
- groupName: ops4
- inputs: ['n1', 'n2']
- scalarRefs: ['n1', 'n2']

#### Inventory delta
- remaining_before_count: 1
- remaining_after_count: 0
- remaining_before: ['o4']
- remaining_after: []

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: findExtremum"]
  n2["n2: findExtremum"]
  n3["n3: compare"]
  n4["n4: diff"]
  n1 --> n3
  n2 --> n3
  n1 --> n4
  n2 --> n4
```

