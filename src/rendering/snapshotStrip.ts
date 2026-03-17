import { createSnapshotThumbnail } from './utils/svgSnapshot'

/**
 * 차트 아래에 ops 그룹별 SVG 스냅샷을 가로로 나열하는 컴포넌트
 */
export class SnapshotStrip {
  private stripEl: HTMLElement

  constructor(parentContainer: HTMLElement) {
    this.stripEl = document.createElement('div')
    this.stripEl.className = 'snapshot-strip'
    this.stripEl.style.cssText =
      'display: flex; flex-direction: row; align-items: flex-start; flex-wrap: nowrap; overflow-x: auto; padding: 8px 0; margin-top: 8px; border-top: 1px solid #eee;'
    parentContainer.appendChild(this.stripEl)
  }

  addSnapshot(svgString: string, scale: number, label?: string): void {
    const thumb = createSnapshotThumbnail(svgString, scale, label)
    this.stripEl.appendChild(thumb)
  }

  clear(): void {
    this.stripEl.innerHTML = ''
  }
}
