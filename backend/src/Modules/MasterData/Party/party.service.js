import Party, { PARTY_TYPES } from './party.model.js'

export const getAllParties = async ({ activeOnly, query = {} } = {}) => {
  const filter = activeOnly ? { isActive: true } : {}
  if (PARTY_TYPES.includes(query.partyType)) filter.partyType = query.partyType
  return Party.find(filter).sort({ name: 1 })
}

export const createParty = async (data) => new Party(data).save()

export const updateParty = async (id, data) => {
  const party = await Party.findByIdAndUpdate(id, data, { new: true, runValidators: true })
  if (!party) throw Object.assign(new Error('Party not found'), { statusCode: 404 })
  return party
}

export const toggleActive = async (id) => {
  const party = await Party.findById(id)
  if (!party) throw Object.assign(new Error('Party not found'), { statusCode: 404 })
  party.isActive = !party.isActive
  return party.save()
}

// Shipper/Consignee on a Booking are free-text contacts, so nothing references a Party.
export const deleteParty = async (id) => {
  const party = await Party.findById(id)
  if (!party) throw Object.assign(new Error('Party not found'), { statusCode: 404 })
  await party.deleteOne()
  return party
}
