import type { InteractionSession } from '../../../../rendering/draw/interaction/session/types'
import { serializeSessionToOperationSpec } from '../../../../rendering/draw/interaction/session/serializer'

export function serializeSessionToJson(session: InteractionSession, space = 2): string {
  const serialized = serializeSessionToOperationSpec(session)
  return JSON.stringify({ ops: serialized.ops }, null, space)
}
