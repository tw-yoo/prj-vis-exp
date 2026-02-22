import type {
  ChartRenderPort,
  ChartStatePort,
  DrawExecutionPort,
  LoggerPort,
  RunChartOpsCommand,
  RunChartOpsResult,
} from '../ports/outbound'

export class RunChartOpsUseCase<Spec = unknown> {
  private readonly renderPort: ChartRenderPort<Spec>
  private readonly statePort: ChartStatePort<Spec>
  private readonly drawPort: DrawExecutionPort
  private readonly logger: LoggerPort

  constructor(
    renderPort: ChartRenderPort<Spec>,
    statePort: ChartStatePort<Spec>,
    drawPort: DrawExecutionPort,
    logger: LoggerPort,
  ) {
    this.renderPort = renderPort
    this.statePort = statePort
    this.drawPort = drawPort
    this.logger = logger
  }

  async execute(command: RunChartOpsCommand<Spec>): Promise<RunChartOpsResult> {
    await this.renderPort.render(command.surface, command.spec)
    const handler = this.drawPort.createHandler(command.surface)
    for (const op of command.ops) {
      try {
        handler.run(op)
      } catch (error) {
        this.logger.warn('runChartOps usecase failed to apply operation', {
          op,
          error,
        })
      }
    }
    return {
      finalWorkingData: this.statePort.readWorkingData(command.surface, command.spec),
    }
  }
}
