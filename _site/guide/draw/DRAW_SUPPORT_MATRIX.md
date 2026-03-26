# Draw Support Matrix

기준 파일:
- Runtime: `src/renderer/draw/supportMatrix.ts`
- OpsBuilder UI: `src/opsBuilder/registry.ts`

표기:
- `✅` supported/visible
- `⚠️` partial
- `❌` unsupported/hidden

## Runtime Matrix

| Draw Action | Simple Bar | Stacked Bar | Grouped Bar | Simple Line | Multi Line |
| --- | --- | --- | --- | --- | --- |
| highlight | ✅ | ✅ | ✅ | ✅ | ✅ |
| dim | ✅ | ✅ | ✅ | ✅ | ✅ |
| clear | ✅ | ✅ | ✅ | ✅ | ✅ |
| text | ✅ | ✅ | ✅ | ✅ | ✅ |
| rect | ✅ | ✅ | ✅ | ✅ | ✅ |
| line | ✅ | ✅ | ✅ | ✅ | ✅ |
| line-trace | ❌ | ❌ | ❌ | ✅ | ❌ |
| bar-segment | ✅ | ✅ | ✅ | ❌ | ❌ |
| split | ✅ | ✅ | ✅ | ✅ | ✅ |
| unsplit | ✅ | ✅ | ✅ | ✅ | ✅ |
| sort | ✅ | ✅ | ✅ | ❌ | ❌ |
| filter | ✅ | ✅ | ✅ | ✅ | ❌ |
| sum | ✅ | ❌ | ❌ | ❌ | ❌ |
| line-to-bar | ❌ | ❌ | ❌ | ✅ | ❌ |
| stacked-to-grouped | ❌ | ✅ | ❌ | ❌ | ❌ |
| grouped-to-stacked | ❌ | ❌ | ✅ | ❌ | ❌ |
| sleep | ❌ | ❌ | ❌ | ❌ | ❌ |
| stacked-filter-groups | ❌ | ✅ | ❌ | ❌ | ❌ |
| grouped-filter-groups | ❌ | ❌ | ✅ | ❌ | ❌ |

## OpsBuilder UI Matrix

| Draw Action | Simple Bar | Stacked Bar | Grouped Bar | Simple Line | Multi Line |
| --- | --- | --- | --- | --- | --- |
| highlight | ✅ | ✅ | ✅ | ✅ | ✅ |
| dim | ✅ | ✅ | ✅ | ✅ | ✅ |
| clear | ✅ | ✅ | ✅ | ✅ | ✅ |
| text | ✅ | ✅ | ✅ | ✅ | ✅ |
| rect | ✅ | ✅ | ✅ | ✅ | ✅ |
| line | ✅ | ✅ | ✅ | ✅ | ✅ |
| line-trace | ❌ | ❌ | ❌ | ✅ | ❌ |
| bar-segment | ✅ | ✅ | ✅ | ❌ | ❌ |
| split | ✅ | ✅ | ✅ | ✅ | ✅ |
| unsplit | ✅ | ✅ | ✅ | ✅ | ✅ |
| sort | ✅ | ✅ | ✅ | ❌ | ❌ |
| filter | ✅ | ✅ | ✅ | ✅ | ❌ |
| sum | ✅ | ❌ | ❌ | ❌ | ❌ |
| line-to-bar | ❌ | ❌ | ❌ | ✅ | ❌ |
| stacked-to-grouped | ❌ | ✅ | ❌ | ❌ | ❌ |
| grouped-to-stacked | ❌ | ❌ | ✅ | ❌ | ❌ |
| sleep | ❌ | ❌ | ❌ | ❌ | ❌ |
| stacked-filter-groups | ❌ | ✅ | ❌ | ❌ | ❌ |
| grouped-filter-groups | ❌ | ❌ | ✅ | ❌ | ❌ |
