import ExcelJS from 'exceljs'
import { validationResult } from 'express-validator'
import * as service from './container.service.js'

export const getOverview = async (req, res, next) => {
  try {
    const { containerType, nvocc, depot } = req.query
    const data = await service.getStockOverview({ containerType, nvocc, depot })
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const getAll = async (req, res, next) => {
  try {
    const { containerType, nvocc, depot, booking } = req.query
    const data = await service.getContainers({ containerType, nvocc, depot, booking })
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const quickAdd = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const { containerType, nvocc, depot, quantity } = req.body
    const data = await service.quickAddStock(containerType, nvocc, depot, Number(quantity))
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export const remove = async (req, res, next) => {
  try {
    await service.deleteContainer(req.params.id)
    res.json({ success: true, message: 'Container deleted' })
  } catch (err) { next(err) }
}

export const updateUnit = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const data = await service.updateContainerUnit(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

// Expected sheet layout (row 1 = header, echoed back so the user can confirm
// their column naming lines up): Column A = Container Type Code |
// Column B = NVOCC Code | Column C = Depot Code | Column D = Container Number
const parseExcelFile = async (buffer) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) {
    throw Object.assign(new Error('The uploaded file has no worksheet'), { statusCode: 400 })
  }

  let headers = []
  const rows = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      headers = row.values.slice(1).map((v) => v?.toString().trim() || '')
      return
    }
    const [, containerTypeCode, nvoccCode, depotCode, containerNumber] = row.values
    if (!containerTypeCode && !nvoccCode && !depotCode && !containerNumber) return // fully blank row — skip entirely
    rows.push({
      rowNumber,
      containerTypeCode: containerTypeCode?.toString().trim(),
      nvoccCode: nvoccCode?.toString().trim(),
      depotCode: depotCode?.toString().trim(),
      containerNumber: containerNumber?.toString().trim(),
    })
  })

  return { headers, rows }
}

export const importPreview = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'An Excel file is required' })
    }
    const { headers, rows } = await parseExcelFile(req.file.buffer)
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'The uploaded file has no data rows' })
    }
    const preview = await service.previewImport(rows)
    res.json({ success: true, data: { headers, rows: preview } })
  } catch (err) { next(err) }
}

export const importCommit = async (req, res, next) => {
  try {
    const { rows } = req.body
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No rows to import' })
    }
    const result = await service.commitImport(rows)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

export const downloadTemplate = async (req, res, next) => {
  try {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'NVOCC System'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Container Stock Import')
    sheet.columns = [
      { header: 'Container Type Code', key: 'containerTypeCode', width: 22 },
      { header: 'NVOCC Code', key: 'nvoccCode', width: 18 },
      { header: 'Depot Code', key: 'depotCode', width: 18 },
      { header: 'Container Number', key: 'containerNumber', width: 22 },
    ]
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } }
    sheet.addRow({ containerTypeCode: '20DC', nvoccCode: 'NVOCC-01', depotCode: 'DEPOT-01', containerNumber: 'MSCU1234567' })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="stock-import-template.xlsx"')
    await workbook.xlsx.write(res)
    res.end()
  } catch (err) { next(err) }
}
