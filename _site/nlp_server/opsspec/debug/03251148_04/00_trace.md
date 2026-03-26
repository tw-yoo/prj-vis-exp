# Recursive Grammar Trace

## Inventory (S(O))
- total_tasks: 3

| taskId | op | sentenceIndex | mention | paramsHint |
| --- | --- | --- | --- | --- |
| o1 | filter | 2 | Check the points between 51 and 61 | `{"field": "Favorable_View_Percentage", "operator": "between", "value": [51, 61]}` |
| o2 | filter | 3 | Check the year of values corresponding to the EU 5-country media between 51 and 61 | `{"group": "EU 5-country median"}` |
| o3 | findExtremum | 4 | Choose the largest year | `{"field": "Year", "which": "max"}` |

## Steps
_no steps executed_
