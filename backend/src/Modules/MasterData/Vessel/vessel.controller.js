import { validationResult } from 'express-validator'
import * as service from './vessel.service.js'

export const getAll = async (req, res, next) => {
  try {
    const activeOnly = req.query.active === 'true'
    const data = await service.getAllVessels(activeOnly)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const create = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const data = await service.createVessel(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export const update = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const data = await service.updateVessel(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const toggle = async (req, res, next) => {
  try {
    const data = await service.toggleActive(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
