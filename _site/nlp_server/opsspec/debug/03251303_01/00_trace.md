# Recursive Grammar Trace

## Inventory (S(O))
- total_tasks: 2

| taskId | op | sentenceIndex | mention | paramsHint |
| --- | --- | --- | --- | --- |
| o1 | sum | 1 | Get the sum of germany and italy for each country | `{"field": "Decrease_in_GDP_Percentage", "group": ["Germany \u0003\u000b exports", "Italy \u0003\u000b exports"]}` |
| o2 | findExtremum | 2 | Get the country with the highest value | `{"field": "Decrease_in_GDP_Percentage", "which": "max"}` |

## Steps

### Step 1
- taskId: o1
- nodeId: n1
- op: sum
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
  n1["n1: sum"]
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
  n1["n1: sum"]
  n2["n2: findExtremum"]
  n1 --> n2
```

