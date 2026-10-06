import Agent from './agent.model.js'

export const getAllAgents = async ({ activeOnly } = {}) => {
  const filter = activeOnly ? { isActive: true } : {}
  return Agent.find(filter).sort({ name: 1 })
}

export const createAgent = async (data) => new Agent(data).save()

export const updateAgent = async (id, data) => {
  const agent = await Agent.findByIdAndUpdate(id, data, { new: true, runValidators: true })
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
