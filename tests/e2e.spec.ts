import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const practice = async (page: Page) => {
  await page.goto('/')
  await expect(page).toHaveTitle('ELISA Analysis Next (Dev)')
  await page.getByRole('button', { name: 'Open practice experiment' }).click()
  await expect(page.getByText('28 reader rows', { exact: true })).toBeVisible()
}
const review = async (page: Page) => {
  await page.getByRole('button', { name: 'Confirm import and mapping' }).click()
  await page
    .getByRole('button', { name: 'Confirm standards and blanks' })
    .click()
  await page.getByRole('button', { name: 'Approve reviewed fit' }).click()
  await page
    .getByRole('button', { name: 'Confirm concentration review' })
    .click()
  await expect(
    page.getByText('6 biological samples contribute', { exact: false }),
  ).toBeVisible()
  await expect(page.locator('.js-plotly-plot')).toBeVisible()
}

test('reviewed concentrations, graph points, exports and package reopen agree', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await practice(page)
  await review(page)
  expect(
    await page.locator('.scatterlayer .trace:first-child .point').count(),
  ).toBe(3)
  await page.getByLabel('Title', { exact: true }).fill('Saved ELISA figure')
  await page.getByLabel('Colour Treatment').fill('#aa5533')
  const csvPromise = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Download sample CSV', exact: true })
    .click()
  const csvDownload = await csvPromise
  const csv = await readFile((await csvDownload.path())!, 'utf8')
  expect(csv).toContain('Sample 1,Control,6')
  expect(csv).toContain('Sample 7,Range checks,,')
  expect(csv).toContain('Sample 8,Range checks,,')
  const packagePromise = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Download experiment package' })
    .click()
  const pkg = await packagePromise
  const pkgPath = (await pkg.path())!
  const saved = JSON.parse(await readFile(pkgPath, 'utf8'))
  expect(saved.payload.experiment.graph.title).toBe('Saved ELISA figure')
  expect(
    saved.payload.results.samples.filter(
      (s: { eligible: boolean }) => s.eligible,
    ),
  ).toHaveLength(6)
  await page
    .getByRole('button', { name: 'New experiment', exact: true })
    .click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page
    .getByLabel('Open experiment', { exact: true })
    .setInputFiles(pkgPath)
  await page.getByRole('button', { name: /Graphs & export/ }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Saved ELISA figure',
  )
  await expect(page.getByLabel('Colour Treatment')).toHaveValue('#aa5533')
  await expect(
    page.getByRole('button', { name: 'Download sample CSV' }),
  ).toBeEnabled()
  expect(errors).toEqual([])
})

test('malformed dilution and original reader rows stay visible until corrected', async ({
  page,
}) => {
  await practice(page)
  await page.getByLabel('Dilution A3', { exact: true }).fill('1:foo')
  await expect(
    page.getByRole('button', { name: 'Confirm import and mapping' }),
  ).toBeDisabled()
  await expect(page.getByLabel('Dilution A3', { exact: true })).toHaveValue(
    '1:foo',
  )
  await page.getByLabel('Dilution A3', { exact: true }).fill('2')
  const text = await page.getByLabel('Reader output').inputValue()
  await page
    .getByLabel('Reader output')
    .fill(`${text}\nA3\tbad\t0.05\nZ99\t1\t0.05`)
  await page
    .getByText('Preview all original reader rows', { exact: true })
    .click()
  await expect(page.getByText('30 reader rows', { exact: true })).toBeVisible()
  await expect(page.getByText('1 unmatched', { exact: true })).toBeVisible()
  await expect(page.getByText('1 duplicates', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Confirm import and mapping' }),
  ).toBeDisabled()
})

test('blank toggle and well review exports use the same offset; upstream edits invalidate review', async ({
  page,
}) => {
  await practice(page)
  await page.getByRole('button', { name: 'Confirm import and mapping' }).click()
  await page.getByLabel('Subtract blank', { exact: true }).uncheck()
  await expect(page.getByText(/Offset: 0 absorbance/)).toBeVisible()
  await page
    .getByRole('button', { name: 'Confirm standards and blanks' })
    .click()
  await page.getByRole('button', { name: 'Approve reviewed fit' }).click()
  await page
    .getByRole('button', { name: 'Confirm concentration review' })
    .click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download well review TSV' }).click()
  const content = await readFile(
    (await (await downloadPromise).path())!,
    'utf8',
  )
  const rows = content
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split('\t'))
  const headers = rows[0]
  const row = rows.find((r) => r[headers.indexOf('Well')] === 'A3')!
  expect(Number(row[headers.indexOf('BlankOffset')])).toBe(0)
  expect(Number(row[headers.indexOf('InputAbsorbance')])).toBeCloseTo(
    Number(row[headers.indexOf('CorrectedAbsorbance')]),
  )
  await page.getByRole('button', { name: /Standards & blanks/ }).click()
  await page.getByLabel('Concentration Std1', { exact: true }).fill('1.2')
  await page.getByRole('button', { name: /Graphs & export/ }).click()
  await expect(
    page.getByRole('button', { name: 'Download sample CSV' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Download sample CSV' }),
  ).toBeEnabled()
})

test('already blank-corrected input cannot receive a second blank subtraction', async ({
  page,
}) => {
  await practice(page)
  const raw = await page.getByLabel('Reader output').inputValue()
  const corrected = raw
    .split('\n')
    .slice(1)
    .map((line) => {
      const [well, a, b] = line.split('\t')
      return `${well}\tbad\t${b}\t${Number(a) - Number(b) - 0.1}`
    })
  await page
    .getByLabel('Reader output')
    .fill(['Well\t450\t570\tNet', ...corrected].join('\n'))
  await page.getByLabel('Input correction state').selectOption('blankCorrected')
  await expect(
    page.getByRole('button', { name: 'Confirm import and mapping' }),
  ).toBeEnabled()
  await page.getByRole('button', { name: /Standards & blanks/ }).click()
  await expect(
    page.getByLabel('Subtract blank', { exact: true }),
  ).not.toBeChecked()
  await expect(
    page.getByLabel('Subtract blank', { exact: true }),
  ).toBeDisabled()
})

test('narrow viewport keeps controls, keyboard focus and the figure within the window', async ({
  page,
}) => {
  await practice(page)
  await review(page)
  await page.getByLabel('Export width (px)', { exact: true }).fill('1100')
  await page.getByLabel('Export height (px)', { exact: true }).fill('550')
  await expect(
    page.getByRole('button', { name: 'Print / save PDF report' }),
  ).toBeEnabled()
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.print-figure')).toBeVisible()
  await page.emulateMedia({ media: 'screen' })
  await page.setViewportSize({ width: 768, height: 900 })
  await expect
    .poll(() =>
      page
        .locator('.plot')
        .evaluate((element) =>
          Math.abs(
            element.clientWidth -
              element.querySelector('svg')!.getBoundingClientRect().width,
          ),
        ),
    )
    .toBeLessThan(2)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.getByRole('button', { name: 'Download sample CSV' }).focus()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('button', { name: 'Download sample TSV' }),
  ).toBeFocused()
  await page
    .getByRole('button', { name: 'New experiment', exact: true })
    .click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Keep working' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Keep working' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
})
