import type { RuntimeResultPort } from '../../../application/ports/outbound'
import { getRuntimeResultsById, resetRuntimeResults, storeRuntimeResult } from '../../../domain/operation/dataOps'
import type { DatumValue } from '../../../domain/operation/types'

export class InMemoryRuntimeResultAdapter implements RuntimeResultPort {
  reset() {
    resetRuntimeResults()
  }

  store(key: string, result: DatumValue[]) {
    storeRuntimeResult(key, result)
  }

  read(key: string) {
    return getRuntimeResultsById(key)
  }
}
