# Recursive Grammar Trace

## Inventory (S(O))
- total_tasks: 6

| taskId | op | sentenceIndex | mention | paramsHint |
| --- | --- | --- | --- | --- |
| o1 | filter | 1 | find the top three values | `{"field": "Year", "include": ["2020", "2019", "2008"]}` |
| o2 | average | 2 | calculate the average | `{"field": "Production in million liters"}` |
| o3 | filter | 3 | find the lowest three values | `{"field": "Year", "include": ["1995", "2000", "2005"]}` |
| o4 | average | 4 | calculate the average | `{"field": "Production in million liters"}` |
| o5 | scale | 5 | double the lowest average | `{"target": "ref:n4", "factor": 2.0}` |
| o6 | compareBool | 6 | compare the two values to find which one is bigger | `{"operator": ">", "targetA": "ref:n2", "targetB": "ref:n5"}` |

## Steps

### Step 1
- taskId: o1
- nodeId: n1
- op: filter
- groupName: ops
- inputs: []
- scalarRefs: []

#### Inventory delta
- remaining_before_count: 6
- remaining_after_count: 5
- remaining_before: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6']
- remaining_after: ['o2', 'o3', 'o4', 'o5', 'o6']

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: filter"]
```

### Step 2
- taskId: o2
- nodeId: n2
- op: average
- groupName: ops2
- inputs: ['n1']
- scalarRefs: []

#### Inventory delta
- remaining_before_count: 5
- remaining_after_count: 4
- remaining_before: ['o2', 'o3', 'o4', 'o5', 'o6']
- remaining_after: ['o3', 'o4', 'o5', 'o6']

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: filter"]
  n2["n2: average"]
  n1 --> n2
```

### Step 3
- taskId: o3
- nodeId: n3
- op: filter
- groupName: ops3
- inputs: []
- scalarRefs: []

#### Inventory delta
- remaining_before_count: 4
- remaining_after_count: 3
- remaining_before: ['o3', 'o4', 'o5', 'o6']
- remaining_after: ['o4', 'o5', 'o6']

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: filter"]
  n2["n2: average"]
  n3["n3: filter"]
  n1 --> n2
```

### Step 4
- taskId: o4
- nodeId: n4
- op: average
- groupName: ops4
- inputs: ['n3']
- scalarRefs: []

#### Inventory delta
- remaining_before_count: 3
- remaining_after_count: 2
- remaining_before: ['o4', 'o5', 'o6']
- remaining_after: ['o5', 'o6']

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: filter"]
  n2["n2: average"]
  n3["n3: filter"]
  n4["n4: average"]
  n1 --> n2
  n3 --> n4
```

### Step 5
- taskId: o5
- nodeId: n5
- op: scale
- groupName: ops5
- inputs: ['n4']
- scalarRefs: ['n4']

#### Inventory delta
- remaining_before_count: 2
- remaining_after_count: 1
- remaining_before: ['o5', 'o6']
- remaining_after: ['o6']

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: filter"]
  n2["n2: average"]
  n3["n3: filter"]
  n4["n4: average"]
  n5["n5: scale"]
  n1 --> n2
  n3 --> n4
  n4 --> n5
```

### Step 6
- taskId: o6
- nodeId: n6
- op: compareBool
- groupName: ops6
- inputs: ['n2', 'n5']
- scalarRefs: ['n2', 'n5']

#### Inventory delta
- remaining_before_count: 1
- remaining_after_count: 0
- remaining_before: ['o6']
- remaining_after: []

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: filter"]
  n2["n2: average"]
  n3["n3: filter"]
  n4["n4: average"]
  n5["n5: scale"]
  n6["n6: compareBool"]
  n1 --> n2
  n3 --> n4
  n4 --> n5
  n2 --> n6
  n5 --> n6
```

