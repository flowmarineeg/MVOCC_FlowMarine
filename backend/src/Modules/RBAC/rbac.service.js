import Role from './role.model.js'
import User from '../Auth/user.model.js'
import { PERMISSIONS, PERMISSION_KEYS } from './permissions.constants.js'

const validatePermissionKeys = (permissions = []) => {
  const invalid = permissions.filter((p) => !PERMISSION_KEYS.includes(p))
  if (invalid.length > 0) {
    throw Object.assign(new Error(`Unknown permission key(s): ${invalid.join(', ')}`), { statusCode: 400 })
  }
}

export const getAllRoles = async () => Role.find().sort({ name: 1 })

export const getRoleById = async (id) => {
  const role = await Role.findById(id)
  if (!role) throw Object.assign(new Error('Role not found'), { statusCode: 404 })
  return role
}

export const createRole = async ({ name, permissions = [], description }) => {
  validatePermissionKeys(permissions)
  const role = new Role({ name, permissions, description })
  return role.save()
}

export const updateRole = async (id, { name, permissions, description }) => {
  const role = await Role.findById(id)
  if (!role) throw Object.assign(new Error('Role not found'), { statusCode: 404 })

  if (role.isSystem && name !== undefined && name.toLowerCase() !== role.name) {
    throw Object.assign(new Error('Cannot rename a system role'), { statusCode: 400 })
  }
  if (permissions !== undefined) validatePermissionKeys(permissions)

  if (name !== undefined) role.name = name
  if (permissions !== undefined) role.permissions = permissions
  if (description !== undefined) role.description = description

  return role.save()
}

export const deleteRole = async (id) => {
  const role = await Role.findById(id)
  if (!role) throw Object.assign(new Error('Role not found'), { statusCode: 404 })
  if (role.isSystem) {
    throw Object.assign(new Error('Cannot delete a system role'), { statusCode: 400 })
  }
  const assignedCount = await User.countDocuments({ role: id })
  if (assignedCount > 0) {
    throw Object.assign(new Error(`Role is assigned to ${assignedCount} user(s)`), { statusCode: 409 })
  }
  await role.deleteOne()
  return role
}

export const getPermissionsCatalog = () => PERMISSIONS
