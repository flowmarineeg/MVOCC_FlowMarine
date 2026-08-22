import User from '../Auth/user.model.js'
import Role from '../RBAC/role.model.js'
import Invitation from './invitation.model.js'
import { generateRawToken, hashToken, hashPassword } from '../../utils/password.util.js'
import { sendInvitationEmail } from '../../utils/email.service.js'

const POPULATE_ROLE = { path: 'role', select: 'name permissions' }
const INVITE_TTL_MS = () => Number(process.env.INVITATION_EXPIRES_DAYS || 7) * 24 * 60 * 60 * 1000

const MEMBER_STATUSES = ['invited', 'active', 'deactivated']
const INVITATION_STATUSES = ['pending', 'accepted', 'refused', 'expired', 'revoked']

// Escapes regex metacharacters so `search` can only match literal text —
// otherwise an unmatched "(" throws, and a crafted pattern risks ReDoS.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const createInvitationForUser = async ({ user, roleId, invitedBy }) => {
  const rawToken = generateRawToken()
  const invitation = await Invitation.create({
    email: user.email,
    role: roleId,
    user: user._id,
    tokenHash: hashToken(rawToken),
    invitedBy,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS()),
  })
  return { invitation, rawToken }
}

export const inviteMember = async ({ email, roleId, invitedBy }) => {
  const normalizedEmail = email.toLowerCase()
  const role = await Role.findById(roleId)
  if (!role) throw Object.assign(new Error('Role not found'), { statusCode: 404 })

  let user = await User.findOne({ email: normalizedEmail })

  if (user && user.status === 'active') {
    throw Object.assign(new Error('This email already belongs to an active member'), { statusCode: 409 })
  }

  if (user && user.status === 'invited') {
    const pending = await Invitation.findOne({ user: user._id, status: 'pending' })
    if (pending) {
      throw Object.assign(new Error('An invitation is already pending for this email'), { statusCode: 409 })
    }
  }

  if (!user) {
    user = await User.create({ email: normalizedEmail, role: roleId, status: 'invited', invitedBy })
  } else {
    // Reuse the placeholder from a previously refused/expired/revoked invite
    user.role = roleId
    user.status = 'invited'
    user.passwordHash = undefined
    user.invitedBy = invitedBy
    await user.save()
  }

  const { invitation, rawToken } = await createInvitationForUser({ user, roleId, invitedBy })
  const inviter = await User.findById(invitedBy)
  const inviteLink = `${process.env.CLIENT_URL}/invite/${rawToken}`

  await sendInvitationEmail({
    to: user.email,
    inviteeName: user.name,
    roleName: role.name,
    invitedByName: inviter?.name || inviter?.email,
    inviteLink,
  })

  return { user, invitation }
}

export const listMembers = async ({ status, search, page = 1, limit = 20 } = {}) => {
  const filter = {}
  if (status && MEMBER_STATUSES.includes(status)) filter.status = status
  if (search && typeof search === 'string') {
    const regex = { $regex: escapeRegex(search), $options: 'i' }
    filter.$or = [{ name: regex }, { email: regex }]
  }

  const skip = (Number(page) - 1) * Number(limit)
  const total = await User.countDocuments(filter)
  const members = await User.find(filter)
    .populate(POPULATE_ROLE)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))

  return { members, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }
}

export const getMemberById = async (id) => {
  const member = await User.findById(id).populate(POPULATE_ROLE)
  if (!member) throw Object.assign(new Error('Member not found'), { statusCode: 404 })
  return member
}

export const updateMemberRole = async (id, roleId) => {
  const role = await Role.findById(roleId)
  if (!role) throw Object.assign(new Error('Role not found'), { statusCode: 404 })
  const member = await User.findByIdAndUpdate(id, { role: roleId }, { new: true, runValidators: true }).populate(POPULATE_ROLE)
  if (!member) throw Object.assign(new Error('Member not found'), { statusCode: 404 })
  return member
}

export const deactivateMember = async (id, requestingUserId) => {
  if (String(id) === String(requestingUserId)) {
    throw Object.assign(new Error('You cannot deactivate your own account'), { statusCode: 400 })
  }
  const member = await User.findByIdAndUpdate(id, { status: 'deactivated' }, { new: true }).populate(POPULATE_ROLE)
  if (!member) throw Object.assign(new Error('Member not found'), { statusCode: 404 })
  return member
}

export const reactivateMember = async (id) => {
  const member = await User.findById(id).select('+passwordHash')
  if (!member) throw Object.assign(new Error('Member not found'), { statusCode: 404 })
  if (!member.passwordHash) {
    throw Object.assign(new Error('This member never completed their invitation — re-invite them instead'), { statusCode: 400 })
  }
  member.status = 'active'
  await member.save()
  return getMemberById(id)
}

export const deleteMember = async (id, requestingUserId) => {
  if (String(id) === String(requestingUserId)) {
    throw Object.assign(new Error('You cannot delete your own account'), { statusCode: 400 })
  }
  const member = await User.findById(id)
  if (!member) throw Object.assign(new Error('Member not found'), { statusCode: 404 })
  if (member.status === 'active') {
    throw Object.assign(new Error('Deactivate this member before deleting them'), { statusCode: 400 })
  }
  await Invitation.deleteMany({ user: id })
  await member.deleteOne()
  return member
}

export const listInvitations = async ({ status, page = 1, limit = 20 } = {}) => {
  const filter = {}
  if (status && INVITATION_STATUSES.includes(status)) filter.status = status

  const skip = (Number(page) - 1) * Number(limit)
  const total = await Invitation.countDocuments(filter)
  const invitations = await Invitation.find(filter)
    .populate('role', 'name')
    .populate('invitedBy', 'name email')
    .populate('user', 'name email status')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))

  return { invitations, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }
}

export const resendInvitation = async (id) => {
  const invitation = await Invitation.findById(id).populate('role', 'name').populate('user')
  if (!invitation) throw Object.assign(new Error('Invitation not found'), { statusCode: 404 })
  if (!['pending', 'expired'].includes(invitation.status)) {
    throw Object.assign(new Error(`Cannot resend an invitation with status: ${invitation.status}`), { statusCode: 400 })
  }

  const rawToken = generateRawToken()
  invitation.tokenHash = hashToken(rawToken)
  invitation.expiresAt = new Date(Date.now() + INVITE_TTL_MS())
  invitation.status = 'pending'
  await invitation.save()

  const inviter = await User.findById(invitation.invitedBy)
  await sendInvitationEmail({
    to: invitation.email,
    inviteeName: invitation.user?.name,
    roleName: invitation.role.name,
    invitedByName: inviter?.name || inviter?.email,
    inviteLink: `${process.env.CLIENT_URL}/invite/${rawToken}`,
  })

  return invitation
}

export const revokeInvitation = async (id) => {
  const invitation = await Invitation.findById(id)
  if (!invitation) throw Object.assign(new Error('Invitation not found'), { statusCode: 404 })
  if (invitation.status !== 'pending') {
    throw Object.assign(new Error(`Cannot revoke an invitation with status: ${invitation.status}`), { statusCode: 400 })
  }

  invitation.status = 'revoked'
  invitation.respondedAt = new Date()
  await invitation.save()

  const user = await User.findById(invitation.user)
  if (user && user.status === 'invited') {
    await user.deleteOne()
  }

  return invitation
}

export const getInvitationByToken = async (rawToken) => {
  const tokenHash = hashToken(rawToken)
  const invitation = await Invitation.findOne({ tokenHash, status: 'pending' })
    .select('+tokenHash')
    .populate('role', 'name')
    .populate('invitedBy', 'name email')

  if (!invitation) throw Object.assign(new Error('Invitation not found or already used'), { statusCode: 404 })

  if (invitation.expiresAt < new Date()) {
    invitation.status = 'expired'
    await invitation.save()
    throw Object.assign(new Error('This invitation has expired'), { statusCode: 410 })
  }

  return invitation
}

export const acceptInvitation = async (rawToken, { name, password }) => {
  const invitation = await getInvitationByToken(rawToken)

  const user = await User.findById(invitation.user)
  if (!user) throw Object.assign(new Error('Associated user not found'), { statusCode: 404 })

  user.name = name
  user.passwordHash = await hashPassword(password)
  user.status = 'active'
  await user.save()

  invitation.status = 'accepted'
  invitation.respondedAt = new Date()
  await invitation.save()

  // Re-fetch rather than returning the in-memory doc: select:false only
  // hides passwordHash on queries, not on a doc we just assigned it to.
  return getMemberById(user._id)
}

export const refuseInvitation = async (rawToken) => {
  const invitation = await getInvitationByToken(rawToken)

  invitation.status = 'refused'
  invitation.respondedAt = new Date()
  await invitation.save()

  await User.findByIdAndUpdate(invitation.user, { status: 'deactivated' })

  return invitation
}
