# `op: "draw"` Guide — Stacked Bar (TS/React+D3)

예시는 `data/test/spec/bar_stacked_ver.json`(month × weather × count) 기준입니다. 이 렌더러는 stacked 색상(`encoding.color`)을 기준으로 여러 시리즈를 한 x 라벨 아래에 누적합니다.

---

## 1. 전용 draw 액션
| action | 필수 | 선택/기본값 | 설명 |
| --- | --- | --- | --- |
| `stacked-filter-groups` | `groupFilter` | `groupFilter.include`(`[]`), `groupFilter.exclude`, `groupFilter.reset` | color(=group) 항목 중 일부만 렌더링하고 나머지 그룹/legend를 제거. y축 스케일도 새 데이터에 맞춰 다시 계산됩니다. |

## 2. `groupFilter` 규칙
- `groups`/`include`/`keep`: 동일한 항목으로 쓰이며, 이 배열에 들어간 그룹(차례로 Vega-Lite의 `color` encoding value)만 원본 데이터에서 골라서 새 stacked 차트로 렌더합니다. (원본 데이터는 첫 렌더 이후 내부 저장소에서 유지되므로 어떤 순서로 실행해도 동일한 기준값으로 필터링됩니다.)
- `exclude`: 이 배열에 들어간 그룹만 제거하고 나머지는 유지합니다. `groups/include/keep`가 없고 `exclude`만 있으면 해당 그룹만 제외하고 나머지를 모두 그립니다.
- `reset`: `true`로 설정하면 현재 필터를 모두 무시하고 처음 렌더되었던 전체 stacked dataset을 다시 그립니다. (legend도 원래대로 돌아옵니다.)

## 3. 예시
### fog + rain만 남기기
```json
{
  "op": "draw",
  "action": "stacked-filter-groups",
  "groupFilter": { "include": ["fog", "rain"] }
}
```
이 draw를 실행하면 내부 `renderStackedBarChart`가 `color`가 `fog` 또는 `rain`인 행만 모아 새로운 Vega-Lite spec을 렌더하므로, y축 최대값과 legend 항목도 실시간으로 재계산됩니다.

### 선택 해제(원본 데이터로 복구)
```json
{
  "op": "draw",
  "action": "stacked-filter-groups",
  "groupFilter": { "reset": true }
}
```
원본 stacked dataset으로 다시 그리므로 누락된 그룹과 legend 항목이 되돌아옵니다.

## 4. 구현 참고
- `src/opsRunner/stackedBarOps.ts`: `splitHandler`로 `stacked-filter-groups`를 감지해 `renderStackedBarChart`를 새 spec으로 재실행하고, `StackedBarDrawHandler`를 새로 생성합니다.
- `src/renderer/bar/stackedBarRenderer.ts`: DOM 상의 rect/path 데이터를 `tagBarMarks`에서 수집해 내부 `localDataStore`/`originalDataStore`에 저장합니다. draw에서 원본 dataset을 참조하므로 어떤 필터 후에도 `reset`으로 전체로 복귀할 수 있습니다.
