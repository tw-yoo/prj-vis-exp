/**
 * Animation Configuration
 * 심플바 기준으로 재조정된 시간 및 스타일 설정
 */

// ============= DURATIONS (ms) =============
export const DURATIONS = {
  // 기본 애니메이션
  HIGHLIGHT: 600,        // 막대 색상 변경 (기존 코드 기준)
  FADE: 400,            // 페이드 인/아웃
  DIM: 400,             // dim 처리 (filter에서 사용)
  
  // 가이드라인 & 레이블
  GUIDELINE_DRAW: 400,  // 가이드라인 그리기
  LABEL_FADE_IN: 400,   // 레이블 페이드인
  
  // 데이터 변환
  REPOSITION: 1000,     // sort 재배치 (기존: 1000ms)
  STACK: 1200,          // sum 스택 애니메이션
  REMOVE: 300,          // 요소 제거
  
  // 특수
  COUNT_INTERVAL: 30,   // count 순차 간격
  NTH_COUNT: 50,       // nth 카운팅 간격
  NTH_HIGHLIGHT: 150,   // nth 개별 하이라이트
  FILTER_DELAY: 700,    // filter dim 후 대기
  SUM_DELAY: 200        // sum 스택 후 대기
};

// ============= OPACITIES =============
export const OPACITIES = {
  FULL: 1.0,           // 완전 표시
  DIM: 0.2,            // 흐리게 (filter, nth)
  SEMI_DIM: 0.3,       // 중간 dim (count 시작)
  HIDDEN: 0            // 완전 숨김
};

// ============= VISUAL STYLES =============
export const STYLES = {
  // 가이드라인 (점선)
  GUIDELINE: {
    strokeDasharray: '5 5',
    strokeWidth: 2,
    opacity: 1                 // 기존: opacity 속성 없음 (항상 1)
  },
  
  // 임계값 선 (filter)
  THRESHOLD: {
    strokeDasharray: '5 5',
    strokeWidth: 2,
    opacity: 1
  },
  
  // 값 레이블
  VALUE_LABEL: {
    fontSize: 12,
    fontWeight: 'bold',
    textAnchor: 'middle',
    stroke: 'white',
    strokeWidth: 3,
    paintOrder: 'stroke'
  },
  
  // 집계 레이블 (sum, average)
  AGGREGATE_LABEL: {
    fontSize: 12,
    fontWeight: 'bold',
    stroke: 'white',
    strokeWidth: 3,
    paintOrder: 'stroke'
  },
  
  // nth 레이블 배경
  LABEL_BACKGROUND: {
    fill: 'white',
    rx: 3,
    opacity: 0.9
  },
  
  // 리트리브 라인
  RETRIEVE_LINE: {
    strokeWidth: 2,
    strokeDasharray: '5,5'
  }
};

// ============= EASING =============
export const EASINGS = {
  DEFAULT: d3.easeCubicInOut,
  SMOOTH: d3.easeCubicOut,
  LINEAR: d3.easeLinear
};

// ============= SPATIAL OFFSETS =============
export const OFFSETS = {
  LABEL_ABOVE_BAR: -6,        // 막대 위 레이블 (getCenter 기준)
  LABEL_ABOVE_LINE: -10,      // 가이드라인 위 레이블
  LABEL_BESIDE_BAR: 4,        // 막대 옆 레이블 (horizontal)
  BRIDGE_OFFSET: -8,          // diff 브리지 라인 오프셋
  NTH_ORDINAL_Y: -15,         // nth 서수 y 오프셋
  NTH_VALUE_Y: -1             // nth 값 y 오프셋
};
