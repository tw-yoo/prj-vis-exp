# Recursive Grammar Trace

## Inventory (S(O))
- total_tasks: 3

| taskId | op | sentenceIndex | mention | paramsHint |
| --- | --- | --- | --- | --- |
| o1 | pairDiff | 1 | calculate the difference between Russia and the US | `{"by": "Year", "seriesField": "Favorability_Direction", "field": "Favorable_View_Percentage", "groupA": "Russia favorability in US", "groupB": "US favorability in Russia", "signed": true, "absolute": false}` |
| o2 | filter | 2 | count the number of years that Russia is higher than the US | `{"field": "Favorable_View_Percentage", "operator": ">", "value": 0}` |
| o3 | count | 2 | count the number of years that Russia is higher than the US | `{"field": "Year"}` |

## Steps

### Step 1
- taskId: o1
- nodeId: n1
- op: pairDiff
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
  n1["n1: pairDiff"]
```

### Step 2
- taskId: o2
- nodeId: n2
- op: filter
- groupName: ops2
- inputs: ['n1']
- scalarRefs: []

#### Inventory delta
- remaining_before_count: 2
- remaining_after_count: 1
- remaining_before: ['o2', 'o3']
- remaining_after: ['o3']

#### Tree snapshot
```mermaid
flowchart LR
  n1["n1: pairDiff"]
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
  n1["n1: pairDiff"]
  n2["n2: filter"]
  n3["n3: count"]
  n1 --> n2
  n2 --> n3
```

