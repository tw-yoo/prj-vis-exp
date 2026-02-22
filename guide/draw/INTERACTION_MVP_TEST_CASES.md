# Draw Interaction MVP Test Cases

## 공통 준비
1. `src/App.tsx`에서 차트를 렌더한다.
2. Chart Preview에서 Draw Tool 버튼이 보이는지 확인한다.
3. 차트가 SVG로 렌더됐는지 확인한다.

## TC-01 Highlight 클릭 선택
1. Draw Tool을 `Highlight`로 선택한다.
2. 막대(또는 점) 하나를 클릭한다.
3. 클릭한 마크만 지정 색상으로 변경되는지 확인한다.

## TC-02 Dim 클릭 선택
1. Draw Tool을 `Dim`으로 선택한다.
2. 막대(또는 점) 하나를 클릭한다.
3. 클릭한 마크는 유지되고 나머지 마크 opacity가 낮아지는지 확인한다.

## TC-03 Text 클릭 배치 + 키보드 입력
1. Draw Tool을 `Text`로 선택한다.
2. 차트 영역을 클릭한다.
3. 오버레이 입력창이 나타나는지 확인한다.
4. 텍스트를 입력하고 `Enter`를 누른다.
5. 클릭 위치에 텍스트 annotation이 생성되는지 확인한다.

## TC-04 Rect 드래그 생성
1. Draw Tool을 `Rect`로 선택한다.
2. 차트 위를 드래그한다.
3. 드래그 중 미리보기 사각형이 보이는지 확인한다.
4. 마우스를 놓으면 최종 rect annotation이 생성되는지 확인한다.

## TC-05 Line 드래그 생성
1. Draw Tool을 `Line`으로 선택한다.
2. 차트 위를 드래그한다.
3. 드래그 중 미리보기 선이 보이는지 확인한다.
4. 마우스를 놓으면 최종 line annotation이 생성되는지 확인한다.

## TC-06 Line Arrow 옵션
1. Draw Tool을 `Line`으로 선택한다.
2. `Arrow Start` 또는 `Arrow End`를 체크한다.
3. 선을 드래그해서 생성한다.
4. 선택한 방향에 arrowhead가 보이는지 확인한다.

## TC-07 ESC 동작
1. `Rect` 또는 `Line` 드래그 도중 `Escape`를 누른다.
2. 미리보기가 취소되는지 확인한다.
3. 드래그 중이 아니면 `Escape` 입력 시 annotation 레이어가 제거되는지 확인한다.

## TC-08 Grouped/Stacked 유니크 선택 키
1. Grouped 또는 Stacked 차트를 렌더한다.
2. `Highlight`로 특정 막대를 클릭한다.
3. 같은 x축 라벨을 가진 다른 패널/시리즈 막대가 함께 하이라이트되지 않는지 확인한다.

## TC-09 Run Operations 이후 재사용
1. OpsBuilder에서 임의의 operation을 실행한다.
2. 실행 후 Draw Tool로 다시 클릭/드래그 동작을 시도한다.
3. 인터랙션이 정상적으로 계속 동작하는지 확인한다.
