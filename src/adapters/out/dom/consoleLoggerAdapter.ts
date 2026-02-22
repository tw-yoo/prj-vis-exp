import type { LoggerPort } from '../../../application/ports/outbound'

export class ConsoleLoggerAdapter implements LoggerPort {
  warn(message: string, context?: unknown) {
    if (context === undefined) {
      console.warn(message)
      return
    }
    console.warn(message, context)
  }
}
