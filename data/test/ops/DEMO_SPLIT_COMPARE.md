# Demo: Simple Bar Split & Compare (Asia vs Europe)

## Overview
이 데모는 Split View 기능을 사용하여 데이터를 두 개의 그룹으로 나누고, 각각 다른 필터링과 하이라이트를 적용한 후 다시 merge하는 시나리오를 보여줍니다.

**목표**: Asian countries (JPN, KOR) vs European countries를 비교하여 평균 rating의 차이를 시각화합니다.

---

## Data Overview

### Original Data (bar_simple_ver.csv)
```
country | rating
--------|-------
USA     | 53
JPN     | 42  ← Asia
KOR     | 52  ← Asia
FRA     | 56  ← Europe
DEU     | 61  ← Europe
GBR     | 75  ← Europe
... (11 more European countries)
```

### Calculation
- **Asia Average**: (42 + 52) / 2 = **47**
- **Europe Average**: (56+61+75+76+59+66+62+59+70+60+48+57+64) / 13 = **62.2**
- **Difference**: 62.2 - 47 = **15.2** (Europe 15.2점 높음)

---

## Step-by-Step Demo Flow

### Step 1: Load Simple Bar Chart
- Spec: `bar_simple_ver.json`
- Shows all 20 countries with their ratings
- **Expected**: All bars in neutral gray color

### Step 2: Split Operation
- **Action**: Click "Split" tool, select all bars
- **What happens**:
  - Chart splits into LEFT and RIGHT surfaces
  - Each surface gets independent SVG and DOM
  - Surface A (left): Will show Asian countries
  - Surface B (right): Will show European countries

**Expected Output:**
```
[Surface A - Left]          [Surface B - Right]
(Empty initially)           (Empty initially)
```

### Step 3: Apply Filter to Each Surface

#### Surface A (Asia): Filter JPN, KOR + Blue Highlight
```json
{
  "op": "filter",
  "args": {
    "field": "country",
    "domain": ["JPN", "KOR"]
  }
},
{
  "op": "highlight",
  "args": {
    "color": "steelblue",
    "fillOpacity": 0.8
  }
}
```

**Expected Output:**
```
Surface A:
  JPN: 42  [████ steelblue]
  KOR: 52  [████ steelblue]
  Average: 47
```

#### Surface B (Europe): Filter 13 European countries + Orange Highlight
```json
{
  "op": "filter",
  "args": {
    "field": "country",
    "domain": [
      "FRA", "DEU", "GBR", "NLD", "BEL", "SWE",
      "DNK", "CHE", "ITA", "IRL", "FIN", "AUT",
      "ESP", "NOR", "PRT"
    ]
  }
},
{
  "op": "highlight",
  "args": {
    "color": "darkorange",
    "fillOpacity": 0.8
  }
}
```

**Expected Output:**
```
Surface B:
  FRA: 56  [███████ darkorange]
  DEU: 61  [████████ darkorange]
  GBR: 75  [███████████ darkorange]
  ... (13 countries)
  Average: 62.2
```

### Step 4: Unsplit/Merge
- **Action**: Run "unsplit" operation
- **What happens**: Both surfaces merge back into single chart
- **Visual**: All bars visible in single view with color preserved

**Expected Output:**
```
[All 28 bars merged]
  Blue bars (JPN, KOR): showing lower ratings
  Orange bars (13 EU): showing higher ratings
  Clear visual difference in color and height
```

---

## How to Run in Workbench

### Option A: Using OpsBuilder UI

1. **Setup**:
   - Load ChartWorkbenchPage
   - Verify Simple Bar chart loads (bar_simple_ver.json)

2. **Copy JSON to OpsBuilder**:
   - Open "Ops JSON" text area in workbench
   - Paste the content from `bar_simple_split_compare_demo_workbench.json`

3. **Run Step-by-Step**:
   - Click each "Run Operations" button
   - Watch how each group transforms

4. **Expected Sequence**:
   ```
   Step 1: split_demo
   ├─ Result: Chart splits into 2 surfaces

   Step 2: filter_asia
   ├─ Result: Left surface shows only JPN, KOR (blue)

   Step 3: filter_europe
   ├─ Result: Right surface shows 13 EU countries (orange)

   Step 4: merge_and_compare
   ├─ Result: All bars merged, color-coded by region
   ```

### Option B: Programmatic (for future automation)
```typescript
// In test script
const spec = require('./bar_simple_split_compare_demo_workbench.json')
await runChartOps(chartInstance, spec)
```

---

## Key Features Demonstrated

✅ **Split Operation**: Independent surfaces from single chart
✅ **Per-Surface Filtering**: Different filters on each surface
✅ **Per-Surface Highlighting**: Different colors per region
✅ **Merge Operation**: Combining surfaces back with visual state preserved
✅ **Comparison**: Color-coded visualization of aggregate metrics

---

## Testing Checklist

- [ ] Chart loads with all 20 bars in neutral gray
- [ ] After split: Left and right surfaces appear with separate SVGs
- [ ] After filter_asia: Left shows only 2 bars (JPN, KOR) in blue
- [ ] After filter_europe: Right shows 13 bars in orange
- [ ] After merge: All 28 bars visible with colors preserved
- [ ] X-axis labels readable and accurate
- [ ] No console errors or warnings

---

## Technical Notes

### Operations Used
- **split**: Creates two independent ChartSurfaceInstances
- **filter**: Uses BaseDrawHandler with field-based domain filtering
- **highlight**: Changes bar fillColor via D3 selection
- **unsplit**: Merges surfaces via SurfaceManager.mergeSurfaces()

### Data Flow
```
Original Chart (20 countries)
  ↓
SPLIT → Surface A + Surface B
  ↓
FILTER (A: JPN,KOR | B: 13 EU)
  ↓
HIGHLIGHT (A: blue | B: orange)
  ↓
UNSPLIT → Merged Chart (28 bars total, color-coded)
```

### Why This Matters
- Proves split view creates truly independent surfaces
- Demonstrates that operations don't interfere across surfaces
- Shows merge preserves visual state from both surfaces
- Validates the SurfaceManager architecture
