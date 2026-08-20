import User from '../Modules/Auth/user.model.js'
import { verifyToken } from '../utils/jwt.util.js'

export const authenticate = async (req, res, next) => {
  try {
    const cookieToken = req.cookies?.[process.env.JWT_COOKIE_NAME || 'nvocc_token']
    const headerToken = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null
    const token = cookieToken || headerToken

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated' })
    }

    let decoded
    try {
      decoded = verifyToken(token)
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired session' })
    }

    const user = await User.findById(decoded.id).populate('role', 'name permissions')
    if (!user || user.status !== 'active') {
      return res.status(401).json({ success: false, message: 'Account not active' })
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: { id: user.role._id.toString(), name: user.role.name },
      permissions: user.role.permissions,
    }
    next()
  } catch (err) {
    next(err)
  }
}

export const authorize = (...requiredPermissions) => (req, res, next) => {
  const missing = requiredPermissions.find((p) => !req.user?.permissions?.includes(p))
  if (missing) {
    return res.status(403).json({ success: false, message: `Forbidden: missing permission "${missing}"` })
  }
  next()
}
