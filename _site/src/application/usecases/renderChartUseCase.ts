import type { ChartRenderPort, RenderChartCommand } from '../ports/outbound'

export class RenderChartUseCase<Spec = unknown> {
  private readonly renderPort: ChartRenderPort<Spec>

  constructor(renderPort: ChartRenderPort<Spec>) {
    this.renderPort = renderPort
  }

  async execute(command: RenderChartCommand<Spec>) {
    await this.renderPort.render(command.surface, command.spec)
  }
}
