# Recursive Grammar Trace

## Inventory (S(O))
- total_tasks: 5

| taskId | op | sentenceIndex | mention | paramsHint |
| --- | --- | --- | --- | --- |
| o1 | filter | 1 | Find the average of the values for 1995 and 1999. | `{"field": "Year", "include": ["1995", "1999"]}` |
| o2 | average | 1 | Find the average of the values for 1995 and 1999. | `{"field": "Installed base in million units"}` |
| o3 | filter | 2 | Find the average of the values for 2010, 2013, and 2017. | `{"field": "Year", "include": ["2010", "2013", "2017"]}` |
| o4 | average | 2 | Find the average of the values for 2010, 2013, and 2017. | `{"field": "Installed base in million units"}` |
| o5 | diff | 3 | Calculate the difference between the two averages. | `{"field": "Installed base in million units", "targetA": "ref:n2", "targetB": "ref:n4", "signed": false}` |

## Steps

### Step 1
- taskId: o1
- nodeId: n1
- op: filter
- groupName: ops
- inputs: []
- scalarRefs: []

#### Inventory delta
- remaining_before_count: 5
- remaining_after_count: 4
- remaining_before: ['o1', 'o2', 'o3', 'o4', 'o5']
- remaining_after: ['o2', 'o3', 'o4', 'o5']

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: filter"]
```

### Step 2
- taskId: o2
- nodeId: n2
- op: average
- groupName: ops
- inputs: ['n1']
- scalarRefs: []

#### Inventory delta
- remaining_before_count: 4
- remaining_after_count: 3
- remaining_before: ['o2', 'o3', 'o4', 'o5']
- remaining_after: ['o3', 'o4', 'o5']

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
- groupName: ops2
- inputs: []
- scalarRefs: []

#### Inventory delta
- remaining_before_count: 3
- remaining_after_count: 2
- remaining_before: ['o3', 'o4', 'o5']
- remaining_after: ['o4', 'o5']

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
- groupName: ops2
- inputs: ['n3']
- scalarRefs: []

#### Inventory delta
- remaining_before_count: 2
- remaining_after_count: 1
- remaining_before: ['o4', 'o5']
- remaining_after: ['o5']

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
- op: diff
- groupName: ops3
- inputs: ['n2', 'n4']
- scalarRefs: ['n2', 'n4']

#### Inventory delta
- remaining_before_count: 1
- remaining_after_count: 0
- remaining_before: ['o5']
- remaining_after: []

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: filter"]
  n2["n2: average"]
  n3["n3: filter"]
  n4["n4: average"]
  n5["n5: diff"]
  n1 --> n2
  n3 --> n4
  n2 --> n5
  n4 --> n5
```

