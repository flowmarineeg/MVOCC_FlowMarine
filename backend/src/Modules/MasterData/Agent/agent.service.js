import Agent from './agent.model.js'

export const getAllAgents = async ({ type, activeOnly } = {}) => {
  const filter = {}
  if (activeOnly) filter.isActive = true
  if (type) filter.type = { $in: [type, 'BOTH'] }
  return Agent.find(filter).sort({ name: 1 })
}

export const createAgent = async (data) => {
  const agent = new Agent(data)
  return agent.save()
}

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
