import { test, expect, type Page } from '@playwright/test'

const SAMPLE_TABLE = `Animal ID\tGroup\tDilution
S001\tSaline\t1
S002\tSaline\t1
S003\tLPS\t1
S004\tLPS\t1
S005\tSaline\t1
S006\tLPS\t1
S007\tSaline\t1
S008\tLPS\t1
S009\tSaline\t2
S010\tLPS\t2
S011\tSaline\t2
S012\tLPS\t2
S013\tSaline\t4
S014\tLPS\t4
S015\tSaline\t4
S016\tLPS\t4
S017\tSaline\t1
S018\tLPS\t1
S019\tSaline\t1
S020\tLPS\t1
S021\tSaline\t2
S022\tLPS\t2
S023\tSaline\t4
S024\tLPS\t4`

const READER_EXAMPLE = `Well\t450\t570
A1\t2.05\t0.05
A2\t2.03\t0.05
B1\t1.77\t0.05
B2\t1.75\t0.05
C1\t1.50\t0.05
C2\t1.48\t0.05
D1\t1.20\t0.05
D2\t1.18\t0.05
E1\t0.90\t0.05
E2\t1.40\t0.05
F1\t0.65\t0.05
F2\t0.63\t0.05
G1\t0.43\t0.05
G2\t0.41\t0.05
H1\t0.29\t0.05
H2\t0.28\t0.05
A3\t0.10\t0.05
B3\t0.10\t0.05
C3\t0.97\t0.05
D3\t0.82\t0.05
E3\t0.71\t0.05
F3\t0.54\t0.05
G3\t0.46\t0.05
H3\t0.36\t0.05`

const openApp = async (page: Page) => {
  await page.goto('/')
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' })
}

test('ELISA app renders layout + analysis tabs', async ({ page }) => {
  await openApp(page)

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

test('ELISA example workflow runs end-to-end with auto-QC apply/reset', async ({ page }) => {
  await openApp(page)

  const samplesCard = page.getByTestId('samples-card')
  await page.getByLabel('First row is headers').check({ force: true })
  await samplesCard.locator('textarea').fill(SAMPLE_TABLE)
  await page.getByTestId('fill-samples').click()

  // Assign standards in duplicate pairs (A1..H2 => Std1..Std8).
  await page.getByTestId('well-A1').click()
  await page.getByTestId('well-H2').click({ modifiers: ['Shift'] })
  await page.getByRole('button', { name: 'Assign Standards' }).click()
  await expect(page.getByTestId('well-A1')).toContainText('Std1')
  await expect(page.getByTestId('well-H2')).toContainText('Std8')

  // Mark A3/B3 as blanks.
  await page.getByTestId('well-A3').click()
  await page.getByTestId('well-B3').click({ modifiers: ['Shift'] })
  await page.getByRole('button', { name: 'Mark Blank' }).click()
  await expect(page.getByTestId('well-A3')).toContainText('Blank')
  await expect(page.getByTestId('well-B3')).toContainText('Blank')

  await expect(page).toHaveScreenshot('elisa-layout-with-standards.png', { fullPage: true })

  await page.getByRole('button', { name: 'Analysis', exact: true }).click()
  const readerCard = page.getByTestId('reader-card')
  await readerCard.locator('textarea').fill(READER_EXAMPLE)

  const curveCard = page.getByTestId('curve-card')
  await expect(curveCard).toContainText('R²:')
  await expect(page).toHaveScreenshot('elisa-analysis-before-autoqc.png', { fullPage: true })

  const applyButton = page.getByTestId('std-autoqc-apply')
  await expect(applyButton).toBeEnabled()
  await applyButton.click()

  await expect(page.getByTestId('std-autoqc-toggle')).toBeChecked()
  await expect(page.getByTestId('std-autoqc')).toContainText('Suggested exclusions applied to fit')
  await expect(page).toHaveScreenshot('elisa-analysis-after-autoqc.png', { fullPage: true })

  await page.getByTestId('std-autoqc-reset').click()
  await expect(page.getByTestId('std-autoqc-toggle')).not.toBeChecked()
  await expect(page.getByTestId('quant-card')).toContainText('S019')
})

test('ELISA analysis shows a warning for invalid reader input', async ({ page }) => {
  await openApp(page)

  await page.getByRole('button', { name: 'Analysis', exact: true }).click()
  await page.getByTestId('reader-card').locator('textarea').fill('not a valid reader export')
  await expect(page.getByRole('alert')).toContainText('Could not parse the reader output')
})
