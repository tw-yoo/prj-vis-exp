/** Synthetic marks represent derived visual marks without mutating source data. */
export interface SyntheticMark {
  kind: 'mergedStack'
  components: string[]
  semanticMeasure: string
}
