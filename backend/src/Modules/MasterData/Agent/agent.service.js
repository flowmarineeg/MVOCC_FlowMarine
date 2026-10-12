import Agent from './agent.model.js'

export const getAllAgents = async ({ activeOnly } = {}) => {
  const filter = activeOnly ? { isActive: true } : {}
  return Agent.find(filter).sort({ name: 1 })
}

// Code is optional. A blank one must be left unset (not stored as ''), or the
// sparse unique index would treat '' as a real value and reject a second agent.
const splitBlankCode = ({ code, ...rest }) => {
  const blank = code === undefined || code === null || String(code).trim() === ''
  return { fields: blank ? rest : { ...rest, code }, clearCode: blank && code !== undefined }
}

export const createAgent = async (data) => new Agent(splitBlankCode(data).fields).save()

export const updateAgent = async (id, data) => {
  const { fields, clearCode } = splitBlankCode(data)
  const update = clearCode ? { ...fields, $unset: { code: 1 } } : fields
  const agent = await Agent.findByIdAndUpdate(id, update, { new: true, runValidators: true })
  if (!agent) throw Object.assign(new Error('Agent not found'), { statusCode: 404 })
  return agent
}

export const toggleActive = async (id) => {
  const agent = await Agent.findById(id)
  if (!agent) throw Object.assign(new Error('Agent not found'), { statusCode: 404 })
  agent.isActive = !agent.isActive
  return agent.save()
}

// Nothing references Agent yet (POL/POD agents on a Booking are free text).
export const deleteAgent = async (id) => {
  const agent = await Agent.findById(id)
  if (!agent) throw Object.assign(new Error('Agent not found'), { statusCode: 404 })
  await agent.deleteOne()
  return agent
}
