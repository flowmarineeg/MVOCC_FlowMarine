import VesselOperator from './vesselOperator.model.js'
import Vessel from '../Vessel/vessel.model.js'

export const getAllVesselOperators = async ({ activeOnly } = {}) => {
  const filter = activeOnly ? { isActive: true } : {}
  return VesselOperator.find(filter).sort({ name: 1 })
}

export const createVesselOperator = async (data) => new VesselOperator(data).save()

export const updateVesselOperator = async (id, data) => {
  const vo = await VesselOperator.findByIdAndUpdate(id, data, { new: true, runValidators: true })
  if (!vo) throw Object.assign(new Error('Vessel operator not found'), { statusCode: 404 })
  return vo
}

export const toggleActive = async (id) => {
  const vo = await VesselOperator.findById(id)
  if (!vo) throw Object.assign(new Error('Vessel operator not found'), { statusCode: 404 })
  vo.isActive = !vo.isActive
  return vo.save()
}

export const deleteVesselOperator = async (id) => {
  const vo = await VesselOperator.findById(id)
  if (!vo) throw Object.assign(new Error('Vessel operator not found'), { statusCode: 404 })
  const usedByVessels = await Vessel.countDocuments({ vesselOperator: id })
  if (usedByVessels > 0) {
    throw Object.assign(new Error(`Vessel operator has ${usedByVessels} vessel(s)`), { statusCode: 409 })
  }
  await vo.deleteOne()
  return vo
}
