import { test, expect } from '@playwright/test'

test('ELISA app renders layout + analysis tabs', async ({ page }) => {
  await page.goto('/')
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' })

  await expect(page.getByTestId('app-hero')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'ELISA plate layout + analysis' })).toBeVisible()

  const layoutTab = page.getByRole('button', { name: 'Layout', exact: true })
  const analysisTab = page.getByRole('button', { name: 'Analysis', exact: true })
  await expect(layoutTab).toBeVisible()
  await expect(analysisTab).toBeVisible()

  await expect(page.getByTestId('layout-tab')).toBeVisible()
  await analysisTab.click()
  await expect(page.getByTestId('analysis-tab')).toBeVisible()

  // Smoke screenshot for visual regression.
  await expect(page).toHaveScreenshot('app_overview.png', { fullPage: true })
})
