import { validationResult } from 'express-validator'
import * as service from './party.service.js'

export const getAll = async (req, res, next) => {
  try {
    const data = await service.getAllParties({ activeOnly: req.query.active === 'true', query: req.query })
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const create = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const data = await service.createParty(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export const update = async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
    const data = await service.updateParty(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const toggle = async (req, res, next) => {
  try {
    const data = await service.toggleActive(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const remove = async (req, res, next) => {
  try {
    await service.deleteParty(req.params.id)
    res.json({ success: true, message: 'Party deleted' })
  } catch (err) { next(err) }
}
