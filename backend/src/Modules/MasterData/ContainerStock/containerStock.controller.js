import { validationResult } from 'express-validator'
import * as service from './containerStock.service.js'

export const getAll = async (req, res, next) => {
  try {
    const data = await service.getAllStock()
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const update = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const data = await service.updateStock(req.params.typeId, req.body.availableCount)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
