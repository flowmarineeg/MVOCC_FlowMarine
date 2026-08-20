import rateLimit from 'express-rate-limit'

const limiterResponse = (req, res) => {
  res.status(429).json({ success: false, message: 'Too many attempts. Please try again later.' })
}

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limiterResponse,
})

export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limiterResponse,
})
