import type { ElisaAnalysisResult } from './elisaAnalysis'
import type { Experiment } from './experiment'

export const download = (
  content: BlobPart,
  filename: string,
  type = 'text/plain;charset=utf-8',
) => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export const safeName = (name: string) =>
  name.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 100) || 'elisa'
const safeCell = (value: unknown) => {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)
  return typeof value === 'string' && /^[=+@\-\t\r]/.test(text)
    ? `'${text}`
    : text
}
export const delimited = (
  rows: Record<string, unknown>[],
  separator = '\t',
): string => {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  const quote = (value: unknown) => {
    const cell = safeCell(value)
    return cell.includes(separator) || /["\r\n]/.test(cell)
      ? `"${cell.replaceAll('"', '""')}"`
      : cell
  }
  return [
    keys.map(quote).join(separator),
    ...rows.map((row) => keys.map((key) => quote(row[key])).join(separator)),
  ].join('\r\n')
}
export const sampleRows = (
  result: ElisaAnalysisResult,
  exp: Experiment,
): Record<string, unknown>[] =>
  result.samples.map((sample) => ({
    Experiment: exp.name,
    Revision: exp.revision,
    SampleId: sample.animalId,
    Group: sample.group,
    Concentration: sample.mean,
    Units: exp.settings.units,
    SD: sample.sd,
    RetainedWells: sample.eligibleReplicateCount,
    TotalWells: sample.totalReplicateCount,
    WithheldWells: sample.withheldReplicateCount,
    Eligible: sample.eligible,
    Status: sample.status,
    Reason: sample.message,
    BlankRule: result.correction.blankRule,
    BlankOffset: result.correction.offset,
    InputMode: exp.settings.inputMode,
  }))
export const wellRows = (
  result: ElisaAnalysisResult,
  exp: Experiment,
): Record<string, unknown>[] =>
  result.wells.map((well) => ({
    Experiment: exp.name,
    Revision: exp.revision,
    Well: well.wellId,
    Type: well.type,
    SampleId: well.animalId,
    Group: well.group,
    Standard: well.standardLevel,
    Keep: well.keep,
    ExclusionReason: well.exclusionReason,
    A450: well.a450,
    A570: well.a570,
    RawWavelengthDifference: well.rawNet,
    InputAbsorbance: well.inputSignal,
    BlankOffset: well.blankOffset,
    CorrectedAbsorbance: well.correctedNet,
    DilutionInput: well.dilutionText,
    DilutionFactor: well.dilutionFactor,
    ConcentrationBeforeDilution: well.concentrationBeforeDilution,
    FinalConcentration: well.concentrationAfterDilution,
    Units: exp.settings.units,
    Eligible: well.eligible,
    Status: well.status,
    Reason: well.message,
  }))
export const exportWorkbook = async (
  result: ElisaAnalysisResult,
  exp: Experiment,
) => {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'EasyLab Next'
  workbook.created = new Date()
  const add = (name: string, rows: Record<string, unknown>[]) => {
    const sheet = workbook.addWorksheet(name)
    if (!rows.length) {
      sheet.addRow(['No rows'])
      return
    }
    const headers = Object.keys(rows[0])
    sheet.columns = headers.map((key) => ({
      header: key,
      key,
      width: Math.min(36, Math.max(14, key.length + 2)),
    }))
    rows.forEach((row) =>
      sheet.addRow(
        Object.fromEntries(
          headers.map((key) => [
            key,
            typeof row[key] === 'object' && row[key] !== null
              ? JSON.stringify(row[key])
              : (row[key] ?? null),
          ]),
        ),
      ),
    )
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF163D3C' },
    }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.autoFilter = {
      from: 'A1',
      to: { row: rows.length + 1, column: headers.length },
    }
  }
  add('Samples', sampleRows(result, exp))
  add('Wells', wellRows(result, exp))
  add(
    'Standards',
    result.standards.map((row) => ({ ...row })),
  )
  add('Settings', [
    {
      ExperimentId: exp.id,
      Revision: exp.revision,
      Practice: exp.practice,
      Preset: exp.preset,
      AssaySettings: exp.settings,
      GraphSettings: exp.graph,
      Approvals: exp.approvals,
      Correction: result.correction,
      Curve: result.curve,
    },
  ])
  add(
    'Original input',
    exp.readerText
      .split(/\r?\n/)
      .map((line, i) => ({ Row: i + 1, OriginalText: line })),
  )
  const buffer = await workbook.xlsx.writeBuffer()
  download(
    new Uint8Array(buffer),
    `${safeName(exp.name)}-r${exp.revision}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
}
