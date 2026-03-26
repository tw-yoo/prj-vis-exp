import { expect, test } from '@playwright/test'

test('demo 페이지가 차트와 문장 리스트를 렌더한다', async ({ page }) => {
  await page.goto('/demo')

  await expect(page.getByTestId('demo-chart-host')).toBeVisible()
  await expect(page.getByTestId('demo-sentence-list')).toBeVisible()
  await expect(page.getByTestId('demo-sentence-item-0')).toBeVisible()
  await expect(page.getByTestId('demo-status')).toContainText('Loaded')
})

test('문장 클릭 시 해당 group이 실행되고 active 상태가 바뀐다', async ({ page }) => {
  await page.goto('/demo')
  const item = page.getByTestId('demo-sentence-item-0')
  await expect(item).toBeVisible()
  await item.click()

  await expect(item).toHaveClass(/is-active/)
  await expect(page.getByTestId('demo-status')).toContainText('Executed group: ops')
})

test('문장 수와 group 수가 다르면 오류를 보여준다', async ({ page }) => {
  await page.route('**/survey/data/demo/sentences_bar_grouped_203_88.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(['문장 하나', '문장 둘']),
    })
  })

  await page.goto('/demo')

  await expect(page.getByTestId('demo-error')).toContainText('must match opsSpec group count')
})
