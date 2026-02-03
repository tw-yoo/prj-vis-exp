# `op: "draw"` Guide — Grouped Bar (TS/React+D3)

예시는 `data/test/spec/bar_grouped_ver.json`(Year × Region × Media rights revenue)입니다. 이 렌더러는 `encoding.column`으로 년도를 나누고, `encoding.color`(Region)를 기준으로 각 컬럼마다 여러 막대를 나란히 그립니다.

---

## 1. 전용 draw 액션
| action | 필수 | 선택/기본값 | 설명 |
| --- | --- | --- | --- |
| `grouped-filter-groups` | `groupFilter` | `groupFilter.include`(`[]`), `groupFilter.exclude`, `groupFilter.reset` | color(=group) 항목 중 일부만 남기고 나머지 그룹/legend를 제거한 후 Vega-Lite spec을 다시 렌더링하여 y축과 legend가 새로운 dataset에 맞춰 재계산됩니다. |

## 2. `groupFilter` 규칙
- `groups`/`include`/`keep`: 세 필드는 동일한 역할로, 이 배열에 들어간 색상(series) 이름(예: `North America`, `Asia Pacific`)만 원본 데이터를 골라 새로운 grouped 차트를 렌더합니다. 어떤 순서로 draw를 호출해도 내부적으로 원본 dataset이 유지되므로 결과가 일관됩니다.
- `exclude`: 특정 그룹을 제거하고 나머지를 그대로 유지합니다. 무시된 그룹은 legend에서도 제거되고, y축도 남은 값만으로 다시 스케일링됩니다.
- `reset`: `true`로 설정하면 현재 필터를 무시하고 최초 렌더링 때의 전체 grouped dataset으로 되돌립니다. 이 방식은 legend와 y축도 원래 상태로 복구합니다.

## 3. 예시
### North America + Asia Pacific만 남기기
```json
{
  "op": "draw",
  "action": "grouped-filter-groups",
  "groupFilter": { "include": ["North America", "Asia Pacific"] }
}
```
실행하면 `data/test/spec/bar_grouped_ver.json`의 Region 중 두 그룹만 남은 Vega-Lite spec이 다시 렌더되므로, y축 최대값이 낮아지고 legend에는 두 그룹만 유지됩니다.

### 일부 그룹 제거(legend에서 사라짐)
```json
{
  "op": "draw",
  "action": "grouped-filter-groups",
  "groupFilter": { "exclude": ["Latin America"] }
}
```
`exclude`를 쓰면 `Latin America` 관련 막대와 legend 항목이 삭제되고, 다시 계산된 y축이 남은 그룹 기준으로 표시됩니다.

### 선택 해제(원본 데이터로 복구)
```json
{
  "op": "draw",
  "action": "grouped-filter-groups",
  "groupFilter": { "reset": true }
}
```
reset을 실행하면 특수한 컬러 필터 없이 처음 데이터를 다시 렌더하므로 legend와 y축이 원래 상태로 돌아옵니다.

## 4. 구현 참고
- `src/opsRunner/groupedBarOps.ts`: `splitHandler`가 `grouped-filter-groups`를 감지해 `cloneDataset`으로 생성한 `data.values`를 `renderGroupedBarChart`에 전달하고, 새로 생성한 `GroupedBarDrawHandler`로 이후 draw 액션을 처리합니다.
- `src/renderer/bar/groupedBarRenderer.ts`: `tagBarMarks`에서 막대 데이터를 수집해 `localDataStore`/`originalDataStore`를 관리하므로 `groupFilter.reset` 시 원본 dataset으로 쉽게 돌아갈 수 있습니다.
