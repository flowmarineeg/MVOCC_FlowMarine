import { Router } from 'express'
import * as ctrl from './auth.controller.js'
import { loginRules, forgotPasswordRules, resetPasswordRules, changePasswordRules } from './auth.validation.js'
import { authenticate } from '../../Middleware/auth.middleware.js'
import { loginLimiter, forgotPasswordLimiter } from '../../Middleware/rateLimiter.js'

const router = Router()

router.post('/login', loginLimiter, loginRules, ctrl.login)
router.post('/logout', ctrl.logout)
router.get('/me', authenticate, ctrl.me)
router.post('/forgot-password', forgotPasswordLimiter, forgotPasswordRules, ctrl.forgotPassword)
router.post('/reset-password/:token', resetPasswordRules, ctrl.resetPassword)
router.post('/change-password', authenticate, changePasswordRules, ctrl.changePassword)

export default router
